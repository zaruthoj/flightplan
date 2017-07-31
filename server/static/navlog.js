server_host = document.location.protocol + '//' + document.location.host
var app = angular.module('app', [
    'ui.grid', 'ui.grid.edit', 'ui.grid.resizeColumns', 'ui.bootstrap',
    'cb.x2js', 'ngMaterial', 'AngularPrint']);

/*
(function() {
  'use strict';

  angular.module('app', ['AngularPrint']);
})();
*/
app.filter('keyboardShortcut', function($window) {
  return function(str) {
    if (!str) return;
    var keys = str.split('-');
    var isOSX = /Mac OS X/.test($window.navigator.userAgent);

    var seperator = (!isOSX || keys.length > 2) ? '+' : '';

    var abbreviations = {
      M: isOSX ? '⌘' : 'Ctrl',
      A: isOSX ? 'Option' : 'Alt',
      S: 'Shift'
    };

    return keys.map(function(key, index) {
      var last = index == keys.length - 1;
      return last ? key : abbreviations[key];
    }).join(seperator);
  };
});

app.service('FlightPlan', function($timeout, $http) {
  this.default_settings = {
    'departure_elevation': NaN,
    'arrival_elevation': NaN,
    'cruise_altitude': NaN,
    'power_pct': NaN,
    'fuel': NaN,
    'weight': NaN,
    'variance': NaN,
    'altimeter': NaN,
    'departure_oat': NaN,
    'cruise_oat': NaN,
    'arrival_oat': NaN,
  };
  this.plan = {
    'waypoints': [],
    'legs': [],
    'settings': this.default_settings,
    'name': 'Untitled',
    'uid': -1,
  };

  this.airports = {}
  this.airports.arrival = {}
  this.airports.departure = {}

  this._LoadFrequency = function(airport_type, category, frequency_labels) {
    this.airports[type][category + '_label'] = ''
    for (label of frequency_labels) {
      if (label in this.plan[airport_type].frequencies) {
        this.airports[airport_type][category + '_label'] = label;
        this.airports[airport_type][category + '_freq'] =
            this.plan[airport_type].frequencies[label].frequency_mhz;
        break;
      }
    }
  }

  this.LoadFlightPlan = function(flight_plan) {
    this.plan.name = flight_plan.name;
    angular.copy(flight_plan, this.plan)
    if (!flight_plan.uid) {
      this.plan.uid = -1;
    }
    for (type of ['arrival', 'departure']) {
      this._LoadFrequency(type, 'weather', ['ATIS', 'AWOS', 'ASOS'])
      this._LoadFrequency(type, 'com', ['TWR', 'CTAF'])
      this._LoadFrequency(type, 'ground', ['GND', 'Ground'])
      this.airports[type].runways = []
      
      for (runway_name in this.plan[type].runways) {
        runway = this.plan[type].runways[runway_name];
        this.airports[type].runways.push(
            {'name': runway_name, 'length': runway.length_ft})
      }
      this.airports[type].url =
          "https://flttrack.fltplan.com/AirportDiagrams/"
          + this.plan[type].id + "apt.jpg";
    }
  }
  
  this.SaveFlightPlan = function() {
    var plan = {};
    angular.copy(this.plan, plan);
    for (var leg of plan.legs) {
      delete leg.$$hashKey;
    }
    var json_fpl = JSON.stringify(plan)
    $http.post(server_host + '/fp/api/plans',
               JSON.stringify(plan)).
      success((function(flight_plan) {
          return function(data, status, headers, config) {
              console.log(data);
              $timeout(flight_plan.LoadFlightPlan(data))
          }
      })(this)).
    error(function(data, status, headers, config) {
      console.log(data);
    });
  };

  this.FetchAndLoadFlightPlan = function(uid) {
    $http.get(server_host + '/fp/api/plans/' + uid, {'cache': false}).
      success((function(flight_plan) {
          return function(plan, status, headers, config) {
              flight_plan.LoadFlightPlan(plan);
          }
      })(this))
      .error(function(data, status, headers, config) {
        console.log(data);
      });
  }
  var url = new URL(window.location.href);
  if (url.searchParams.has("uid")) {
    var uid = url.searchParams.get("uid");
    this.FetchAndLoadFlightPlan(uid);
  }
});

app.controller('MenuBar', ['$scope', '$http', '$mdDialog', 'FlightPlan', 'x2js',
               function MenuBar($scope, $http, $mdDialog, FlightPlan, x2js) {
  $scope.fp = FlightPlan.plan;
  this.settings = {
    printLayout: true,
    showRuler: true,
    showSpellingSuggestions: true,
    presentationMode: 'edit'
  };

  this.Import = function(event) {
    $('#fpl_file_form').get(0).reset();
    $('#fpl_file').click();
  };

  $scope.FileChanged = function(event) {
    var reader = new FileReader();
    var file = null;
    if (event.currentTarget.files.length == 1) {
      file = event.currentTarget.files[0];
    }
  
    reader.onload = function(e) {
      var json_fpl = x2js.xml_str2json(reader.result);
      var flight_plan = ConvertFpl(json_fpl, file.name);
      $scope.$apply(FlightPlan.LoadFlightPlan(flight_plan));
    };
    
    if (file != '') {
      reader.readAsText(file);
    }
  };

  this.Open = function(event) {
    $mdDialog.show(
    {
      templateUrl: "open_dialog.html",
      clickOutsideToClose: true,
      controller: OpenDialogController,
    });
  }

  this.SaveTemplate = function(event) {
    var template = {
      'legs': {},
      'waypoints': {}
    };
    for (colDef of $("#legs").scope().gridOptions['columnDefs']) {
      var name = colDef['name'];
      var width = $("#legs").scope().$$childHead.grid.getColumn(name).width;
      template['legs'][name] = {'width': width}
    }
    for (colDef of $("#waypoints").scope().gridOptions['columnDefs']) {
      var name = colDef['name'];
      var width = $("#waypoints").scope().$$childHead.grid.getColumn(name).width;
      template['waypoints'][name] = {'width': width}
    }
    $http.post(server_host + '/fp/api/template', JSON.stringify(template)).
      success(function(data, status, headers, config) {
        console.log(data);
    }).
    error(function(data, status, headers, config) {
      console.log(data);
    });
  };
}]);

function OpenDialogController($scope, $http, $mdDialog, FlightPlan) {
  $scope.saved_plans = {};
  $http.get(server_host + '/fp/api/plans', {'cache': false}).
    success(function(saved_plans, status, headers, config) {
      $scope.options = Object.values(saved_plans)
      $scope.saved_plans = {};
      for (key in saved_plans) {
        $scope.saved_plans[saved_plans[key]] = key;
      }
    }).error(function(data, status, headers, config) {
      console.log(data);
    });
  
  $scope.open = function() {
    $mdDialog.hide();
    var plan_name = $scope.chosenOption;
    if (!(plan_name in $scope.saved_plans)) {
      console.log("Could not find plan with name: " + plan_name);
      return;
    }
    var plan_uid = $scope.saved_plans[plan_name];
    FlightPlan.FetchAndLoadFlightPlan(plan_uid);
  };

  $scope.close = function() {
    $mdDialog.cancel();
  };
}


function FetchAndLoadGridTemplate (http, scope, label) {
  if (typeof FetchAndLoadGridTemplate.template_age == 'undefined') {
    FetchAndLoadGridTemplate.template_age_ms = 0;
    FetchAndLoadGridTemplate.template = {};
  }
  var now_ms = new Date().getTime();
  if (now_ms - FetchAndLoadGridTemplate.template_age_ms < 10*1000) {
    ApplyGridTemplate(scope, label, FetchAndLoadGridTemplate.template)
    return;
  }

  http.get(server_host + '/fp/api/template', {'cache': false}).
    success(function(template, status, headers, config) {
      FetchAndLoadGridTemplate.template = template;
      FetchAndLoadGridTemplate.template_age_ms = now_ms;
      ApplyGridTemplate(scope, label, template);
    }).error(function(template, status, headers, config) {
      console.log(template);
    });
}

function ApplyGridTemplate(scope, label, template) {
  for (colDef of scope.gridOptions['columnDefs']) {
    var name = colDef['name'];
    if (!(label in template)) {return;}
    if (name in template[label]) {
      var settings = template[label][name];
      colDef['width'] = settings['width'];
      scope.$$childHead.grid.getColumn(name).width = settings['width'];
    }
  }
}

app.controller('PlanSettings', ['$scope', 'FlightPlan',
    function PlanSettings($scope, FlightPlan) {
  $scope.fp = FlightPlan.plan;
  $scope.SaveFlightPlan = function() {
    FlightPlan.SaveFlightPlan();
  };
}]);

GenWaypointController = function(show_notes) {
  return function ($scope, $http, $timeout, uiGridConstants,
                         FlightPlan) {
    $scope.fp = FlightPlan.plan;
    $scope.$watchCollection('fp.waypoints', function(newVal, old) {
      $scope.gridOptions.data = [];
      if (typeof newVal == 'undefined') {return;}
      for (waypoint of newVal) {
        $scope.gridOptions.data.push(waypoint);
      }
    }); 
    
    $scope.gridOptions = {
      'enableHorizontalScrollbar': uiGridConstants.scrollbars.NEVER,
      'enableVerticalScrollbar': uiGridConstants.scrollbars.NEVER,
  
      'columnDefs': [
        {
          name: 'notes',
          displayName: 'Notes',
          enableCellEdit: true,
          type: 'string',
          width: '50%',
          visible: show_notes
        }, {
          name: 'waypoint',
          displayName: 'Waypoint',
          enableCellEdit: true,
          type: 'string',
        },
      ],
      'data': [],
    };
  
    $scope.gridOptions.onRegisterApi = function(gridApi){
      //set gridApi on scope
      $scope.gridApi = gridApi;
      gridApi.edit.on.afterCellEdit($scope, function(rowEntity, colDef,
                                                     newValue, oldValue) {
        FlightPlan.SaveFlightPlan();
      });
    };
    if (show_notes) {FetchAndLoadGridTemplate($http, $scope, 'waypoints');}
  }
}



app.controller('WaypointsWithNotes', ['$scope', '$http', '$timeout',
                                      'uiGridConstants', 'FlightPlan',
               GenWaypointController(true)]);

app.controller('Waypoints', ['$scope', '$http', '$timeout',
                             'uiGridConstants', 'FlightPlan',
               GenWaypointController(false)]);


variance = -13.5;
wind_dir = 310;
wind_speed = 10;
altitude = 3500;

function degrees (angle) {
  return angle * (180 / Math.PI);
}

function radians (angle) {
  return angle * (Math.PI / 180);
}

function norm_angle(angle) {
  if (angle < 0) {return angle + 360;}
  if (angle > 360) {return angle - 360;}
  return angle;
}

function calc_dist(row) {
  var lat_start = radians(row.entity.lat_start);
  var lat_end = radians(row.entity.lat_end);
  var delta_lon = radians(row.entity.lon_end - row.entity.lon_start)
  var R = 3440; // gives d in nm
  return Math.acos(
    Math.sin(lat_start) * Math.sin(lat_end)
    + Math.cos(lat_start)*Math.cos(lat_end) * Math.cos(delta_lon) ) * R;
}

function calc_tc(row) {
  var lat_start = radians(row.entity.lat_start);
  var lat_end = radians(row.entity.lat_end);
  var lon_start = radians(row.entity.lon_start);
  var lon_end = radians(row.entity.lon_end);
  var y = Math.sin(lon_end-lon_start) * Math.cos(lat_end);
  var x = Math.cos(lat_start)*Math.sin(lat_end) -
          Math.sin(lat_start)*Math.cos(lat_end)*Math.cos(lon_end-lon_start);
  return norm_angle(degrees(Math.atan2(y, x)));
}

function calc_tas(row) {
  //return row.entity.ias * (1 + .02 * row.entity.altitude / 1000)
  return row.entity.tas;
}

function calc_wca(row) {
  return degrees(
    Math.asin(
      Math.sin(
        radians(row.entity.wind_dir - calc_tc(row))
      ) * row.entity.wind_speed / calc_tas(row)));
}

function calc_mc(row) {
  return norm_angle(calc_tc(row) + variance);
}

function calc_mh(row) {
  return norm_angle(calc_mc(row) + calc_wca(row));
}

function calc_gs(row) {
  var tas = calc_tas(row);
  var wind_speed = row.entity.wind_speed;
  var wind_dir = row.entity.wind_dir;
  var tc = calc_tc(row);
  return Math.sqrt(
    Math.pow(tas, 2) + Math.pow(wind_speed, 2)
    - 2 * tas * wind_speed * Math.cos(radians(wind_dir - tc - calc_wca(row))));
}

function calc_ete(row) {
  return calc_dist(row) / calc_gs(row) * 60;
}

app.controller('Legs', ['$scope', '$http', '$timeout', 'uiGridConstants',
                        'FlightPlan',
               function ($scope, $http, $timeout, uiGridConstants, FlightPlan) {
  $scope.fp = FlightPlan.plan;
  $scope.data = []
  $scope.$watchCollection('fp.legs', function(newVal) {
    if (typeof newVal == 'undefined') {return;}
    $scope.gridOptions.data.length = 0;
    for (leg of newVal) {
      $scope.gridOptions.data.push(leg);
    }
  });

  $scope.CalcDist = function(row) {
    return calc_dist(row).toFixed(1);
  };
  
  $scope.CalcTc = function(row) {
    return calc_tc(row).toFixed(0);
  };
  
  $scope.CalcMc = function(row) {
    return calc_mc(row).toFixed(0);
  };
  
  $scope.CalcMh = function(row) {
    return calc_mh(row).toFixed(0);
  };
  
  $scope.CalcTas = function(row) {
    return calc_tas(row).toFixed(0) + " / ___";
  };
  
  $scope.CalcWca = function(row) {
    return calc_wca(row).toFixed(2);
  };
  
  $scope.CalcGs = function(row) {
    return calc_gs(row).toFixed(0);
  };
  
  $scope.CalcEte = function(row) {
    return calc_ete(row).toFixed(1);
  };

  $scope.Errors = function(row, error_type) {
    if (error_type in row.entity.errors) {
      return row.entity.errors[error_type].join(', ');
    }
    return '';
  }
 
  $scope.GetClass = function(row, error_type) {
    if (error_type in row.entity.errors) {
      return 'cell-error';
    }
    return '';
  }

  $scope.gridOptions = {
    'enableHorizontalScrollbar': uiGridConstants.scrollbars.NEVER,
    'enableVerticalScrollbar': uiGridConstants.scrollbars.NEVER,
    'columnDefs': [{
        name: 'lat_start',
        displayName: 'Lat',
        enableCellEdit: true,
        type: 'number',
        enableColumnMenu: false,
        visible: false
      }, {
        name: 'lon_start',
        displayName: 'Lon',
        enableCellEdit: true,
        type: 'number',
        enableColumnMenu: false,
        visible: false
      }, {
        name: 'lat_end',
        displayName: 'Lat',
        enableCellEdit: true,
        type: 'number',
        enableColumnMenu: false,
        visible: false
      }, {
        name: 'lon_end',
        displayName: 'Lon',
        enableCellEdit: true,
        type: 'number',
        enableColumnMenu: false,
        visible: false
      }, {
        name: 'low_alt',
        displayName: '',
        enableCellEdit: true,
        enableColumnMenu: false,
        type: 'number',
        width: '30'
      }, {
        name: 'altitude',
        displayName: 'Alt',
        enableCellEdit: true,
        type: 'number',
        enableColumnMenu: false,
        cellClass: function(grid, row, col, rowRenderIndex, colRenderIndex) {
          return $scope.GetClass(row, 'altitude')
        }
      }, {
        name: 'high_alt',
        displayName: '',
        enableCellEdit: true,
        enableColumnMenu: false,
        type: 'number',
        width: '30'
      }, {
        name: 'rpm',
        displayName: 'RPM',
        enableCellEdit: true,
        type: 'number',
        enableColumnMenu: false,
        cellClass: function(grid, row, col, rowRenderIndex, colRenderIndex) {
          return $scope.GetClass(row, 'rpm')
        }
      }, {
        name: 'wind_dir',
        displayName: 'Wdir',
        enableCellEdit: true,
        type: 'number',
        enableColumnMenu: false
      }, {
        name: 'wind_speed',
        displayName: 'Ws',
        enableCellEdit: true,
        type: 'number',
        enableColumnMenu: false
      }, {
        name: 'tc',
        displayName: 'TC',
        enableCellEdit: false,
        type: 'number',
        enableColumnMenu: false,
        cellTemplate: '<div class="ui-grid-cell-contents">{{grid.appScope.CalcTc(row)}}</div>',
      }, {
        name: 'mc',
        displayName: 'MC',
        type: 'number',
        enableColumnMenu: false,
        enableCellEdit: false,
        cellTemplate: '<div class="ui-grid-cell-contents">{{grid.appScope.CalcMc(row)}}</div>',
      }, {
        name: 'mh',
        displayName: 'MH',
        enableColumnMenu: false,
        enableCellEdit: false,
        cellTemplate: '<div class="ui-grid-cell-contents">{{grid.appScope.CalcMh(row)}}</div>',
      }, {
        name: 'wca',
        displayName: 'WCA',
        enableCellEdit: false,
        type: 'number',
        enableColumnMenu: false,
        visible: false,
        cellTemplate: '<div class="ui-grid-cell-contents">{{grid.appScope.CalcWca(row)}}</div>',
      }, {
        name: 'tas',
        displayName: 'TAS',
        enableCellEdit: false,
        type: 'number',
        enableColumnMenu: false,
        cellTemplate: '<div class="ui-grid-cell-contents">{{grid.appScope.CalcTas(row)}}</div>',
        cellClass: function(grid, row, col, rowRenderIndex, colRenderIndex) {
          return $scope.GetClass(row, 'tas')
        }
      }, {
        name: 'ground_speed',
        displayName: 'GS',
        enableCellEdit: false,
        type: 'number',
        enableColumnMenu: false,
        cellTemplate: '<div class="ui-grid-cell-contents">{{grid.appScope.CalcGs(row)}}</div>',
      }, {
        name: 'distance',
        displayName: 'Dist',
        enableCellEdit: false,
        type: 'number',
        enableColumnMenu: false,
        cellTemplate: '<div class="ui-grid-cell-contents">{{grid.appScope.CalcDist(row)}}</div>',
      }, {
        name: 'ate',
        displayName: 'ATE',
        enableCellEdit: true,
        type: 'number',
        enableColumnMenu: false
        
      }, {
        name: 'ete',
        displayName: 'ETE',
        enableCellEdit: false,
        type: 'number',
        enableColumnMenu: false,
        cellTemplate: '<div class="ui-grid-cell-contents">{{grid.appScope.CalcEte(row)}}</div>',
      }, {
        name: 'efu',
        displayName: 'EFU',
        enableCellEdit: true,
        type: 'number',
        enableColumnMenu: false,
        cellClass: function(grid, row, col, rowRenderIndex, colRenderIndex) {
          return $scope.GetClass(row, 'fuel')
        }
      }, {
        name: 'efr',
        displayName: 'EFR',
        enableCellEdit: true,
        type: 'number',
        enableColumnMenu: false
      }, {
        name: 'afr',
        displayName: 'AFR',
        enableCellEdit: true,
        type: 'number',
        enableColumnMenu: false
      }, {
        name: 'errors',
        displayName: 'Errors',
        visible: false, 
      }
    ],
    'data': [],
  };
  
  FetchAndLoadGridTemplate($http, $scope, 'legs');
  
  $scope.gridOptions.onRegisterApi = function(gridApi){
    //set gridApi on scope
    $scope.gridApi = gridApi;
    gridApi.edit.on.afterCellEdit($scope, function(rowEntity, colDef,
                                                   newValue, oldValue) {
      FlightPlan.SaveFlightPlan();
    });
  };
}]);

function ConvertFpl(json_fpl, file_name) {
  var flight_plan = {
    'waypoints': [],
    'legs': [],
    'settings': [],
    'name': file_name.split('.')[0],
  };
  waypoints = json_fpl['flight-plan']['waypoint-table']['waypoint'];
  for (var i = 0; i < waypoints.length; i++) {
    var waypoint = waypoints[i];
    flight_plan.waypoints.push({
      'waypoint': waypoint['identifier'],
      'notes': waypoint['type']
    });
    
    if (i < waypoints.length - 1) {
      var start = waypoints[i];
      var end = waypoints[i+1];
      flight_plan.legs.push({
        'lat_start': start['lat'],
        'lon_start': start['lon'],
        'lat_end': end['lat'],
        'lon_end': end['lon'],
        'wind_dir': wind_dir,
        'wind_speed': wind_speed,
        'tas': 0,
        'altitude': altitude,
      });
    }
  }
  return flight_plan;
}

app.directive('fileModel', function() {
  return {
    restrict: 'A',
    link: function (scope, element, attrs) {
      var onChangeFunc = scope.$eval(attrs.fileModel);
      element.bind('change', onChangeFunc);
    }
  };
});

app.directive('airportInfo', function() {
  return {
    templateUrl: 'airport_info.html',
  }
});

app.controller('Airport', ['$scope', 'FlightPlan',
    function Airport($scope, FlightPlan) {
  $scope.airport = {};
  $scope.$watch('type', function() {
    $scope.airport = FlightPlan.airports[$scope.type];
  });
  $scope.tpa = "1000 / 800";
  $scope.takeoff_performance = "800 / 1200";
  $scope.landing_performance = "800 / 1275";
}]);

app.directive('atis', function() {
  return {
    templateUrl: 'atis.html',
  }
});

app.directive('fuel', function() {
  return {
    templateUrl: 'fuel.html',
  }
});

app.controller('Hide', ['$scope',
    function Airport($scope) {
  $scope.hide = true;
}]);


