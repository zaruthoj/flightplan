#!flask/bin/python
from flask import Flask, jsonify, make_response, request, send_from_directory, abort

app = Flask(__name__, static_url_path='')

template = {
  'legs': {
  },
  'waypoints': {
  },
}

plans = {
}

@app.route('/static/<path:path>', methods=['GET'])
def get_index():
  return send_from_directory('static', path)

@app.route('/fp/api/template', methods=['GET'])
def get_template():
  global template
  return jsonify(template)

@app.route('/fp/api/template', methods=['POST'])
def create_template():
  global template
  if not request.json:
    abort(400)
  template = request.json
  return jsonify(template), 201

@app.route('/fp/api/plans', methods=['GET'])
def list_plans():
  return jsonify(plans.keys())

@app.route('/fp/api/plans/<string:plan_name>', methods=['GET'])
def get_plan(plan_name):
  global plans
  if plan_name not in plans:
    abort(404)
  return jsonify(plans[plan_name])

@app.route('/fp/api/plans', methods=['POST'])
def create_plan():
  global plans
  if not request.json:
    abort(400)
  plans[request.json['plan_name']] = request.json
  print plans[request.json['plan_name']]
  return jsonify(plans[request.json['plan_name']]), 201

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
