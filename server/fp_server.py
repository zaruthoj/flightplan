#!flask/bin/python
import os
from flask import Flask, jsonify, make_response, request, send_from_directory, abort
from tinydb import TinyDB, Query
import performance
import airports

app = Flask(__name__, static_url_path='')

db = TinyDB('db.json')
templates = db.table('templates')
plans = db.table('plans')
user_name = 'zaruthoj'
airport_data = airports.AirportFiles(
    'airport_info/airports.csv',
    'airport_info/airport-frequencies.csv',
    'airport_info/runways.csv')


@app.route('/static/<string:path>', methods=['GET'])
def get_file():
  return send_from_directory('static', path)

@app.route('/fp/api/template', methods=['GET'])
def get_template():
  global templates
  q = Query()
  if not templates.contains(q.user == user_name):
    templates.insert({'user': user_name, 'legs': {}, 'waypoints': {}})
  return jsonify(templates.search(q.user == user_name)[0])

@app.route('/fp/api/template', methods=['POST'])
def create_template():
  global templates
  if not request.json:
    abort(400)
  q = Query()
  template = request.json
  template['user'] = user_name
  templates.update(template, q.user == user_name)
  return jsonify(template), 201

@app.route('/fp/api/plans', methods=['GET'])
def list_plans():
  q = Query()
  user_plans = plans.search(q.user == user_name)
  return jsonify({plan['uid']: plan['name'] for plan in user_plans})

def get_performance(plan):
  if any([setting == None for setting in plan['settings'].itervalues()]):
    for leg in plan['legs']:
      leg['errors'] = {}
    return

  prev_altitude = plan['settings']['departure_elevation']
  prev_weight = plan['settings'].get('weight', 2050.0)
  for leg in plan['legs']:
    leg_data = performance.LegData(
        settings=plan['settings'], weight=prev_weight,
        from_ialt=prev_altitude, to_ialt=leg['altitude'],
        lat_start=leg['lat_start'], lon_start=leg['lon_start'],
        lat_end=leg['lat_end'], lon_end=leg['lon_end'],
        wind_speed=leg['wind_speed'], wind_dir=leg['wind_speed'])
    calculator = performance.LegCalculator(leg_data)
    result = calculator.calculate()
    leg['tas'] = result['tas']
    leg['rpm'] = result['rpm']
    leg['ground_speed'] = result['gs']
    leg['efu'] = result['fuel']
    leg['errors'] = leg_data.errors
    prev_altitude = leg['altitude']
    prev_weight = result['weight']

def get_airports(plan):
  departure = None
  arrival = None
  try:
    departure = plan['waypoints'][0].get('waypoint', None)
    arrival = plan['waypoints'][-1].get('waypoint', None)
  except IndexError:
    pass

  plan['departure'] = {}
  plan['arrival'] = {}
  if departure:
    plan['departure'] = airport_data.get_data(departure)
  if arrival:
    plan['arrival'] = airport_data.get_data(arrival)

@app.route('/fp/api/plans/<int:uid>', methods=['GET'])
def get_plan(uid):
  global plans
  if not plans.contains(eids=[uid]):
    abort(404)
  plan = plans.get(eid=uid)
  if not plan:
    abort(404)
  get_airports(plan)
  get_performance(plan)
  return jsonify(plan)

@app.route('/fp/api/plans', methods=['POST'])
def create_plan():
  global plans
  if not request.json:
    abort(400)
  plan = request.json
  name = plan['name']
  uid = plan['uid']
  plan['user'] = user_name
  if uid == -1:
    q = Query()
    elem = plans.get(q.user == user_name and q.name == name)
    if elem:
      uid = elem.eid
      plans.update(plan, eids=[uid])
    else:
      uid = plans.insert(plan)
  else:
    plans.update(plan, eids=[uid])
  plan['uid'] = uid
  
  get_airports(plan)
  get_performance(plan)
  print plan
  return jsonify(plan), 201

@app.errorhandler(404)
def not_found(error):
  return make_response(jsonify({'error': 'Not found'}), 404)

@app.after_request
def add_header(response):
    """
    Add headers to both force latest IE rendering engine or Chrome Frame,
    and also to cache the rendered page for 10 minutes.
    """
    #response.headers['X-UA-Compatible'] = 'IE=Edge,chrome=1'
    response.headers['Cache-Control'] = 'no-cache, max-age=0'
    return response

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0')
