import unittest
import airports

class TestAirports(unittest.TestCase):
  def setUp(self):
    self.airports = airports.AirportFiles(
        'airport_info/airports.csv',
        'airport_info/airport-frequencies.csv',
        'airport_info/runways.csv')

  def test_palo_alto(self):
    data = self.airports.get_data('KPAO')
    self.assertEqual(data['runways']['31 / 13']['length_ft'], '2443')
    self.assertEqual(
        '118.6',
        data['frequencies'].get('TWR', {}).get('frequency_mhz', None))
    self.assertEqual(data['elevation_ft'], '4')

  def test_byron(self):
    data = self.airports.get_data('C83')
    self.assertEqual(data['runways']['30 / 12']['length_ft'], '4500')
    self.assertEqual(data['runways']['23 / 5']['length_ft'], '3000')
    self.assertEqual(
        '123.775',
        data['frequencies'].get('AWOS', {}).get('frequency_mhz', None))
    self.assertEqual(data['elevation_ft'], '79')

  def test_non_existent(self):
    data = self.airports.get_data('DOES_NOT_EXIST')
    self.assertEqual(data, {})

if __name__ == '__main__':
  unittest.main()
