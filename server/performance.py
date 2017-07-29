import numpy as np
import scipy.interpolate
from PIL import Image, ImageDraw
from math import *
from collections import defaultdict

class Bounds(object):
  def __init__(self, bottom_left_point, top_right_point, bottom_left_pixel, top_right_pixel):
    self.bottom_left_point = bottom_left_point
    self.top_right_point = top_right_point
    self.bottom_left_pixel = bottom_left_pixel
    self.top_right_pixel = top_right_pixel
    self.x_val_to_pixel = LinearFunction((bottom_left_point[0], bottom_left_pixel[0]), (top_right_point[0], top_right_pixel[0]))
    self.y_val_to_pixel = LinearFunction((bottom_left_point[1], bottom_left_pixel[1]), (top_right_point[1], top_right_pixel[1]))

  def point_to_pixel(self, point):
    return (self.x_val_to_pixel.eval(point[0])[0], self.y_val_to_pixel.eval(point[1])[0])

class LinearFunction(object):
  def __init__(self, p1, p2):
    self.m = float(p2[1] - p1[1]) / (p2[0] - p1[0])
    self.b = p1[1] - self.m * p1[0]
    self.p1 = p1
    self.p2 = p2

  def eval(self, x):
    y = self.m * x + self.b
    if ((x >= self.p1[0] and x <= self.p2[0]) or
        (x >= self.p2[0] and x <= self.p1[0])):
      return y, True
    return y, False

class BiSplineChartSection(object):
  def __init__(self, name, bounds,
               x_min, x_max, x_step,
               y_min, y_max, y_step,
               z_data):
    self.name = name
    self.bounds = bounds
    self.eval_inputs = 2
    self.x_min = x_min
    self.x_max = x_max
    self.y_min = y_min
    self.y_max = y_max
    self.x = np.array(range(x_min, x_max + 1, x_step)
                      * ((y_max - y_min) / y_step + 1))
    self.y = np.array([range(y_min, y_max + 1, y_step),]
                      * ((x_max - x_min) / x_step + 1)).transpose().flatten()
    self.z = np.array(z_data)
    self.spline = scipy.interpolate.SmoothBivariateSpline(self.x, self.y, self.z)

  def check_bounds(self, x, y):
    if x < self.x_min or x > self.x_max or y < self.y_min or y > self.y_max:
      return "Input out of bounds.  Result is an extrapolation."
    return ""

  def eval(self, data):
    x, y = data
    z = self.spline.ev(x, y)
    vline = [
        self.bounds.point_to_pixel(
            (x, self.bounds.bottom_left_point[1])),
        self.bounds.point_to_pixel((x, z))]
    hline = [self.bounds.point_to_pixel((x, z))]
    return (z, self.check_bounds(x, y), vline, hline)

class UniSplineChartSection(object):
  def __init__(self, name, bounds,
               x_min, x_max, x_step,
               y_data):
    self.name = name
    self.bounds = bounds
    self.eval_inputs = 1
    self.x_min = x_min
    self.x_max = x_max
    self.x_step = x_step
    self.x = np.array(range(x_min, x_max + 1, x_step))
    self.y = np.array(y_data)
    self.spline = scipy.interpolate.UnivariateSpline(self.x, self.y)

  def check_bounds(self, x):
    if x < self.x_min or x > self.x_max:
      return "Input out of bounds.  Result is an extrapolation."
    return ""

  def eval(self, data):
    x = data[0]
    y = self.spline(x)
    vline = [
        self.bounds.point_to_pixel(
            (y, self.bounds.bottom_left_point[1])),
        self.bounds.point_to_pixel((y, x))]
    hline = [self.bounds.point_to_pixel((y, x))]
    return (y, self.check_bounds(x), vline, hline)


class IndexedLinearChartSection(object):
  def __init__(self, name, bounds, points_dict):
    self.name = name
    self.bounds = bounds
    self.lines = {}
    self.eval_inputs = 2
    for index, points in points_dict.iteritems():
      self.lines[index] = LinearFunction(points[0], points[1])

  def eval(self, data):
    x, y = data
    if x not in self.lines:
      raise ValueError("X must be aligned with a step for IndexedLinearChartSection. "
                       "Got %d, expected one of %s" % (x, str(self.lines.keys())))
    z, between = self.lines[x].eval(y)
    error = "" if between else "Input out of bounds.  Result is an extrapolation."
    vline = [
        self.bounds.point_to_pixel((z, y)),
        self.bounds.point_to_pixel(
            (z, self.bounds.bottom_left_point[1])),
    ]
    hline = [self.bounds.point_to_pixel((z, y))]
    return (z, error, vline, hline)


class Chart(object):
  def __init__(self, image_file, chart_sections):
    self.chart_sections = chart_sections
    self.image_file = image_file

  def eval(self, input_list):
    if len(input_list) != len(self.chart_sections) + 1:
      raise ValueError("input_list contains %d values, expected %d." %
          (len(input_list), len(self.chart_sections)))
    prev_val = input_list[0]
    next_input = 1
    errors = []
    values = {}
    vlines = []
    hline = []
    
    for chart_section in self.chart_sections:
      prev_val, error, s_vline, s_hline = chart_section.eval(
          input_list[next_input:
                     next_input + chart_section.eval_inputs - 1]
          + [prev_val])
      if error: errors.append(error)
      values[chart_section.name] = prev_val
      vlines.append(s_vline)
      hline.extend(s_hline)
      next_input += 1
    return (values, errors, vlines + [hline])

  def draw(self, lines):
    img  = Image.open(self.image_file)
    draw = ImageDraw.Draw(img)
    for line in lines:
      draw.line(line, (0,0,255),3)
    
    img.show()

def c_to_f(temp_c):
  return temp_c * 9.0/5.0 + 32

class AircraftPerformance(object):
  def __init__(self):
    self.charts = {}
    self.tas_chart = self._build_tas_chart()
    self.rpm_chart = self._build_rpm_chart()
    self.climb_fpm_chart = self._build_climb_fpm_chart()
    self.climb_fuel_chart = self._build_climb_fuel_chart()
    self.cruise_climb_ias = 87
    self.vy = 76
    self.descent_ias = 120
    self.cruise_climb_fpm_penalty = 150
    self.max_gross = 2550

  def cruise_tas(self, temp_c, p_alt, power_pct):
    values, errors, lines = self.tas_chart.eval(
        [p_alt, c_to_f(temp_c), power_pct])
    #self.tas_chart.draw(lines)
    return (float(values['tas']), errors)
  
  def cruise_rpm(self, temp_c, p_alt, power_pct):
    values, errors, lines = self.rpm_chart.eval(
        [p_alt, c_to_f(temp_c), power_pct])
    #self.rpm_chart.draw(lines)
    return (float(values['rpm']), errors)

  def climb_fpm(self, temp_c, p_alt):
    values, errors, lines = self.climb_fpm_chart.eval(
        [p_alt, c_to_f(temp_c), 0])
    #self.climb_fpm_chart.draw(lines)
    return (float(values['fpm']), errors)

  def climb_fuel(self, from_p_alt, to_p_alt, p_alt_to_temp_c):
    from_temp_f = c_to_f(p_alt_to_temp_c.eval(from_p_alt)[0])
    to_temp_f = c_to_f(p_alt_to_temp_c.eval(to_p_alt)[0])
    f_values, errors, f_lines = (
        self.climb_fuel_chart.eval(
            [from_p_alt, from_temp_f, 0]))
    t_values, t_errors, t_lines = (
        self.climb_fuel_chart.eval(
            [to_p_alt, to_temp_f, 0]))
    
    #self.climb_fuel_chart.draw(f_lines + t_lines)
    errors.extend(t_errors)

    return (float(t_values['fuel'] - f_values['fuel']), errors)

  def cruise_fuel(self, time_min, power_pct):
    burn_table = {55: 7.8, 65: 9.0, 75: 10.5}
    if power_pct not in burn_table:
      return (-1, ['Power must be one of 55, 65, or 75. '
                   'Got %d.' % power_pct
      ])
    return (burn_table[power_pct] * time_min / 60.0, [])
    

  def _build_tas_chart(self):
    #       -20   0     20    40    60    80    100
    mult = [-1,   -1,   -1,   -1,   0,    2.6,  5,    # 0
            -1,   -1,   -0.8, 2.3,  5,    7.5,  10,   # 2000
            -1,   1.8,  4.6,  7.3,  10,   12.4, 15,   # 4000
            4,    7,    9.6,  12,   15,   17.2, 19.5, # 6000
            9,    12,   14.6, 17.2, 20,   22,   24,   # 8000
            14,   17,   19.6, 22,   24.7, 27,   30,   # 10000
            19,   22,   24.6, 27,   30,   30,   30,   # 12000
            24,   27,   30,   30,   30,   30,   30]   # 14000
    
    tas_table = {}
    tas_table[55] = [(0, 91.5), (28, 110)]
    tas_table[65] = [(0, 102.5), (23.8, 120.5)]
    tas_table[75] = [(0, 111), (18, 125)]
    
    mult_spline = BiSplineChartSection(
        "mult",
        Bounds((-20, 0), (100, 28), (17, 604), (247, 57)),
        -20, 100, 20, 0, 14000, 2000, mult)
    tas_section = IndexedLinearChartSection(
        "tas",
         Bounds((90, 0), (130, 28), (480, 604), (788, 57)),
         tas_table)
    return Chart('PA28-181/cruise_tas.png',
                 [mult_spline, tas_section])

  def _build_rpm_chart(self):
    mult = [-1,   -1,   -1,   -1,   0,    2.6,  5, 
            -1,   -1,   0,    2.6,  5,    7.6,  10, 
            -1,   1.9,  4.6,  7.2,  10,   12.3, 14.8,
            4,    6.9,  9.8,  12.2, 15,   17.3, 19.5,
            9,    12,   14.8, 17.3, 19.9, 22.1, 23.4, 
            14,   16.8, 19.6, 22.1, 24.7, 26,   28,
            20,   21.9, 24.5, 27,   30,   30,   30,
            24,   26.8, 30,   30,   30,   30,   30]
    
    rpm_table = {}
    rpm_table[55] = [(0, 2130), (28, 2450)]
    rpm_table[65] = [(0, 2300), (24, 2600)]
    rpm_table[75] = [(0, 2440), (18, 2650)]

    mult_spline = BiSplineChartSection(
        "mult",
        Bounds((-20, 0), (100, 28), (17, 603), (250, 57)),
        -20, 100, 20, 0, 14000, 2000, mult)
    rpm_section = IndexedLinearChartSection(
        "rpm",
         Bounds((2000, 0), (2700, 28), (367, 603), (638, 57)),
         rpm_table)
    return Chart('PA28-181/cruise_rpm.png',
                 [mult_spline, rpm_section])

  def _build_climb_fpm_chart(self):
    mult = [-10.2, -7.6,  -5.1,  -2.5,  0,     2.6,   5.1, 
            -5.4,  -2.8,  -0.2,  2.6,   5,     7.6,   10,   
            -1.2,  1.7,   4.6,   7.2,   9.8,   12.3,  14.8,
            4,     6.8,   9.7,   12.2,  14.9,  17.3,  19.5,    
            9,     11.9,  14.8,  17.2,  19.8,  22.1,  24.4,
            14,    15.9,  19.6,  22,    24.7,  27,    30,
            19,    21.9,  24.5,  27,    30,    30,    30,
            24,    26.9,  30,    30,    30,    30,    30]
    
    climb_fpm_table = {}
    climb_fpm_table[0] = [(-20, 1211), (28, 80)]
    
    mult_spline = BiSplineChartSection(
        "mult",
        Bounds((-20, 0), (100, 28), (14, 601), (245, 55)),
        -20, 100, 20, 0, 14000, 2000, mult)
    fpm_section = IndexedLinearChartSection(
        "fpm",
         Bounds((0, 0), (1000, 28), (399, 601), (783, 55)),
         climb_fpm_table)
    return Chart('PA28-181/climb_fpm.png',
                 [mult_spline, fpm_section])

  def _build_climb_fuel_chart(self):
    mult = [0,    0,    0,    0,    0,    0,    0,
            2.1,  2.3,  2.6,  2.8,  3.1,  3.5,  4,
            4.1,  4.8,  5.2,  6,    6.5,  7.2,  8.2,  
            6.6,  7.4,  8.2,  9.1,  10.2, 11.2, 12.7,
            9.2,  10.3, 11.5, 12.7, 14,   15.8, 17.9, 
            11.9, 13.2, 14.8, 16.2, 18.1, 21,   22,   
            14.8, 16.3, 18.2, 20.9, 22,   22,   22]

    fuel = [0, 0.4, 1.25, 2.1, 2.75, 4, 5.25, 6.9]

    mult_spline = BiSplineChartSection(
        "mult",
        Bounds((-20, 0), (100, 21), (5, 601), (279, 189)),
        -20, 100, 20, 0, 12000, 2000, mult)
    fuel_spline = UniSplineChartSection(
        "fuel",
        Bounds((0, 0), (7.5, 21), (317, 601), (377, 189)),
        0, 21, 3,  fuel)
    return Chart('PA28-181/climb_tdf.png',
                 [mult_spline, fuel_spline])

def ialt_to_palt(ialt, altimeter):
  return ialt + (29.92 - altimeter) * 1000

def ialt_to_dalt(ialt, altimeter, temp_c):
  return (1.24 * ialt_to_palt(ialt, altimeter)
          + 118.8 * temp_c - 1782)

def ias_to_tas(ias, from_dalt, to_dalt):
  from_tas = ias * (1 + .015 * from_dalt / 1000.0)
  to_tas = ias * (1 + .015 * to_dalt / 1000.0)
  return (from_tas + to_tas) / 2.0

def calc_dist(lat_start, lon_start, lat_end, lon_end):
  lat_start_r = radians(lat_start)
  lat_end_r = radians(lat_end)
  delta_lon = radians(lon_end - lon_start)
  R = 3440 # gives d in nm
  return acos(sin(lat_start_r) * sin(lat_end_r)
              + cos(lat_start_r) * cos(lat_end_r)
              * cos(delta_lon)) * R

def norm_angle(angle):
  if angle > 360: return angle - 360
  if angle < 0: return angle + 360
  return angle

def calc_tc(lat_start, lon_start, lat_end, lon_end):
  lat_start_r = radians(lat_start)
  lat_end_r = radians(lat_end)
  lon_start_r = radians(lon_start)
  lon_end_r = radians(lon_end)
  y = sin(lon_end_r - lon_start_r) * cos(lat_end_r)
  x = (cos(lat_start_r) * sin(lat_end_r)
      - sin(lat_start_r) * cos(lat_end_r)
      * cos(lon_end_r - lon_start_r))
  return norm_angle(degrees(atan2(y, x)))


aircraft = AircraftPerformance()

class LegData(object):
  def __init__(self, settings, weight, from_ialt, to_ialt,
               lat_start, lon_start, lat_end, lon_end,
               wind_speed, wind_dir):
    self.settings = settings
    for key, val in settings.iteritems():
      setattr(self, key, float(val))
    self.weight = float(weight)
    self.from_ialt = float(from_ialt)
    self.to_ialt = float(to_ialt)
    self.distance = calc_dist(float(lat_start), float(lon_start),
                              float(lat_end), float(lon_end))
    self.tc = calc_tc(float(lat_start), float(lon_start),
                      float(lat_end), float(lon_end))
    self.wind_speed = float(wind_speed)
    self.wind_dir = float(wind_dir)
    self.palt_to_temp_c = LinearFunction(
        (self.departure_elevation, self.departure_oat),
        (self.cruise_altitude, self.cruise_oat))
    self.errors = defaultdict(list)

  @property
  def from_palt(self):
    return ialt_to_palt(self.from_ialt, self.altimeter)
  
  @property
  def to_palt(self):
    return ialt_to_palt(self.to_ialt, self.altimeter)

  @property
  def from_temp_c(self):
    return self.palt_to_temp_c.eval(self.from_palt)[0]
  
  @property
  def to_temp_c(self):
    return self.palt_to_temp_c.eval(self.to_palt)[0]

  @property
  def from_dalt(self):
    return ialt_to_dalt(self.from_ialt, self.altimeter,
                        self.from_temp_c)

  @property
  def to_dalt(self):
    return ialt_to_dalt(self.to_ialt, self.altimeter,
                        self.to_temp_c)


class Calculator(object):
  def __init__(self, leg_data):
    self.l = leg_data

  def _calc_gs(self, tas):
    return sqrt(tas ** 2 + self.l.wind_speed ** 2
                - 2 * tas * self.l.wind_speed * cos(
                    radians(self.l.wind_dir - self.l.tc
                            - self._calc_wca(tas))))

  def _calc_wca(self, tas):
    return degrees(asin(sin(radians(self.l.wind_dir - self.l.tc))
                        * self.l.wind_speed / float(tas)));

  def match(self):
    raise NotImplementedError()
    return False

  def Calculate(self):
    raise NotImplementedError()
    return None

class CruiseCalculator(Calculator):
  def match(self):
    return self.l.from_ialt == self.l.to_ialt

  def calculate(self, prev_tas=None):
    if not prev_tas or prev_tas > 100:
      tas, errors = aircraft.cruise_tas(
          self.l.to_temp_c, self.l.to_palt, self.l.power_pct)
      if errors: self.l.errors['tas'].extend(errors)
      rpm, errors = aircraft.cruise_rpm(
          self.l.to_temp_c, self.l.to_palt, self.l.power_pct)
      if errors: self.l.errors['rpm'].extend(errors)
    else:
      tas = prev_tas
      rpm = 2100
    gs = self._calc_gs(tas)
    time_min = self.l.distance / (gs / 60.0)
    fuel, errors = aircraft.cruise_fuel(time_min, self.l.power_pct)
    if errors:
      self.l.errors['fuel'].extend(errors)
    distance = self.l.distance
    self.l.distance = 0
    self.l.weight -= fuel * 6
    return {'type': 'cruise',
            'tas': tas,
            'rpm': rpm,
            'gs': gs,
            'time_min': time_min,
            'fuel': fuel,
            'distance': distance}

class ClimbCalculator(Calculator):
  def __init__(self, leg_data, ias, fpm_adjustment=0):
    super(ClimbCalculator, self).__init__(leg_data)
    self.ias = ias
    self.fpm_adjustment = fpm_adjustment

  def calculate(self, prev_tas=None):
    tas = ias_to_tas(self.ias, self.l.from_dalt,
                     self.l.to_dalt)
    rpm = 'F'
    gs = self._calc_gs(tas)
    from_fpm, from_errors = aircraft.climb_fpm(
        self.l.from_temp_c, self.l.from_palt)
    to_fpm, to_errors = aircraft.climb_fpm(
        self.l.to_temp_c, self.l.to_palt)
    if from_errors or to_errors:
      self.l.errors['ete'].extend(from_errors + to_errors)
    fpm = (from_fpm + to_fpm) / 2.0
    fpm *= aircraft.max_gross / self.l.weight
    fpm += self.fpm_adjustment
    fuel, errors = aircraft.climb_fuel(
        self.l.from_palt, self.l.to_palt, self.l.palt_to_temp_c)
    fuel *= fpm / (fpm + self.fpm_adjustment)
    if errors: self.l.errors['fuel'].extend(errors)
    time_min = (self.l.to_ialt - self.l.from_ialt) / fpm
    distance = gs / 60.0 * time_min
    if distance > self.l.distance:
      self.l.errors['altitude'].append(
          'Not enough distance to climb.  Needed %dnm.'
          % distance)
    self.l.distance -= distance
    self.l.from_ialt = self.l.to_ialt
    self.l.weight -= fuel * 6
    return {'type': self.type,
            'tas': tas,
            'rpm': rpm,
            'gs': gs,
            'time_min': time_min,
            'fuel': fuel,
            'distance': distance}

class VyClimbCalculator(ClimbCalculator):
  def __init__(self, leg_data):
    self.type = 'vy climb'
    super(VyClimbCalculator, self).__init__(leg_data, aircraft.vy)
 
  def match(self):
    return (self.l.from_ialt < self.l.to_ialt and
            self.l.from_ialt == self.l.departure_elevation)

  def calculate(self, prev_tas=None):
    to_ialt = self.l.to_ialt
    self.l.to_ialt = self.l.from_ialt + 1000
    result = super(VyClimbCalculator, self).calculate(prev_tas)
    self.l.to_ialt = to_ialt
    return result

class CruiseClimbCalculator(ClimbCalculator):
  def __init__(self, leg_data):
    self.type = 'cruise climb'
    super(CruiseClimbCalculator, self).__init__(
        leg_data, aircraft.cruise_climb_ias, -150)
 
  def match(self):
    return (self.l.from_ialt < self.l.to_ialt)

class DescentCalculator(Calculator):
  def match(self):
    return self.l.from_ialt > self.l.to_ialt

  def calculate(self, prev_tas=None):
    tas = ias_to_tas(120, self.l.from_dalt, self.l.to_dalt)
    time_min = self.l.distance / tas * 60.0
    fpm = (self.l.from_ialt - self.l.to_ialt) / time_min
    max_fpm = 1000.0
    rpm_func = LinearFunction((0.0, 2600.0), (500.0, 2400.0))
    rpm = rpm_func.eval(fpm)[0]
    fuel_func = LinearFunction((0.0, 9.0), (500.0, 5.5))
    fuel = fuel_func.eval(fpm)[0]
    gs = self._calc_gs(tas)
    if fpm > max_fpm:
      self.l.errors['altitude'].append(
          'Requires descent at > 1000 FPM.')
    self.l.distance = 0
    self.l.from_ialt = self.l.to_ialt
    self.l.weight -= fuel * 6
    return {'type': 'descent',
            'tas': tas,
            'rpm': rpm,
            'gs': gs,
            'time_min': time_min,
            'fuel': fuel,
            'distance': self.l.distance}

class LegCalculator(Calculator):
  def match(self):
    return True

  def calculate(self):
    calculators = [
        VyClimbCalculator(self.l),
        CruiseClimbCalculator(self.l),
        DescentCalculator(self.l),
        CruiseCalculator(self.l)
    ]
    tas = None
    data_list = []
    for calculator in calculators:
      if not calculator.match():
        continue
      data_list.append(calculator.calculate(tas))
      tas = data_list[-1]['tas']
      if self.l.distance <= 0:
        break
    result = data_list[0]
    for i in range(1, len(data_list)):
      data = data_list[i]
      next_frac = float(data['distance']) / (result['distance']
                                             + data['distance'])
      result_frac = 1 - next_frac
      for metric in ('tas', 'gs'):
        result[metric] = (result[metric] * result_frac
                          + data[metric] * next_frac)
      for metric in ('time_min', 'distance', 'fuel'):
        result[metric] = result[metric] + data[metric]
    for metric in ('tas', 'rpm', 'gs'):
      if isinstance(result[metric], float):
        result[metric] = round(result[metric], 0)
    for metric in ('time_min', 'distance', 'fuel'):
      result[metric] = round(result[metric], 1)
    result['weight'] = self.l.weight
    return result

# t = 100
# a = 8000
# p = 65
# dep_alt = 1000
# cruise_alt = 7500
# dep_temp_c = 22
# cruise_temp_c = 15
# p_alt_to_temp_c = LinearFunction((dep_alt, dep_temp_c),
#                                  (cruise_alt, cruise_temp_c))
# aircraft = AircraftPerformance()
# fuel, errors = aircraft.climb_fuel(3000, 7500, p_alt_to_temp_c)
# print 'Fuel: ', fuel
# print errors
# rpm, errors = aircraft.cruise_rpm(22, 6000, 65)
# print 'RPM: ', rpm
# print errors






