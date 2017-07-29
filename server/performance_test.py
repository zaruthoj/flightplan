import unittest
import performance

class TestPerformance(unittest.TestCase):
  def setUp(self):
    self.settings = {
        'departure_elevation': 7,
        'arrival_elevation': 1000,
        'cruise_altitude': 9500,
        'power_pct': 65,
        'fuel': 48,
        'variance': -13.5,
        'altimeter': 30.24,
        'departure_oat': 32,
        'cruise_oat': 18,
        'arrival_oat': 30
    }
  r"""
  def test_cruise(self):
    leg_data = performance.LegData(
        self.settings, from_ialt=6500, to_ialt=6500,
        distance=20, tc=250, wind_speed=0, wind_dir=0)
    calculator = performance.LegCalculator(leg_data)
    result = calculator.calculate()
    self.assertEqual(result['distance'], 20)
    self.assertEqual(int(result['tas']), 115)"""
  def test_climb_out(self):
    leg_data = performance.LegData(
        self.settings, from_ialt=7, to_ialt=2300,
        lat_start=37.461111, lon_start=-122.115056, 
        lat_end=37.500000, lon_end=-122.133333,
        wind_speed=0, wind_dir=0)
    calculator = performance.LegCalculator(leg_data)
    result = calculator.calculate()
    self.assertEqual(result['distance'], 6.55)
    print result

if __name__ == '__main__':
    unittest.main()
