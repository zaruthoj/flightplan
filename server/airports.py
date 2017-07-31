import csv

# Fix KC\d\d airports:
# sed -i 's/KC\([0-9][0-9]\)/C\1/' airport_info/airports.csv

class Reader(object):
  def __init__(self, file_name, ident_column, fields, key_func):
    self.f = open(file_name)
    self.csv = csv.DictReader(self.f, delimiter=',', quotechar='"')
    self.current = None
    self.ident_column = ident_column
    self.fields = fields
    self.key_func = key_func

  def _maybe_advance(self):
    if not self.current:
      self.current = self.csv.next()

  def get_airport_id(self):
    try:
      self._maybe_advance()
    except StopIteration:
      return None
    return self.current[self.ident_column]

  def get_fields(self):
    try:
      self._maybe_advance()
    except StopIteration:
      return None
    result = {}
    for field in self.fields:
      result[field] = self.current[field]
    return (self.key_func(self.current), result)

  def proceed(self):
    self.current = None

class AirportFiles(object):
  def __init__(self, airport_file, freq_file, runway_file):
    airports = Reader(airport_file, 'ident', ['elevation_ft'],
                      lambda x: x['ident'])
    runways = Reader(runway_file, 'airport_ident', 
        ['length_ft', 'width_ft',
         'le_ident', 'le_displaced_threshold_ft',
         'he_ident', 'he_displaced_threshold_ft'],
         lambda x: x['he_ident'] + ' / ' + x['le_ident'].lstrip('0'))
    frequencies = Reader(freq_file, 'airport_ident',
                         ['frequency_mhz'],
                         lambda x: x['type'])
    self.airport_data = {}
    
    while airports.get_airport_id():
      current_id = airports.get_airport_id()
      _, self.airport_data[current_id] = airports.get_fields()
      self.airport_data[current_id]['id'] = current_id
      airports.proceed()

      self.airport_data[current_id]['runways'] = {}
      self.airport_data[current_id]['frequencies'] = {}
      for info_type, reader in [('runways', runways),
                                ('frequencies', frequencies)]:
        while reader.get_airport_id() == current_id:
          key, fields = reader.get_fields()
          self.airport_data[current_id][info_type][key] = fields
          reader.proceed()
  
  def get_data(self, airport_id):
    return self.airport_data.get(airport_id, {})

