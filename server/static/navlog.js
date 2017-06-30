server_host = document.location.protocol + '//' + document.location.host
var app = angular.module('app', ['ui.grid', 'ui.grid.edit', 'ui.grid.resizeColumns',
                                 'cb.x2js', 'ngMaterial']);
 
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

app.service('FlightPlan', function() {
  this.default_settings = {
    'departure_elevation': NaN,
    'arrival_elevation': NaN,
    'fuel': NaN,
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
    'uid': null,
  };
});

app.controller('MenuBar', ['$scope', '$http', '$mdDialog',
               function MenuBar($scope, $http, $mdDialog) {
  $scope.plan_name = 'Untitled';
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

  this.Open = function(event) {
    $mdDialog.show(
    {
      templateUrl: "open_dialog.html",
      clickOutsideToClose: true,
      controller: OpenDialogController,
    });
  }

  $scope.LoadFlightPlan = function(flight_plan) {
    $scope.plan_name = flight_plan.plan_name;
  }

  $scope.SaveFlightPlan = function() {
    var flight_plan = {}
    flight_plan.plan_name = $scope.plan_name;
    $("#legs").scope().SaveFlightPlan(flight_plan);
    $("#waypoints").scope().SaveFlightPlan(flight_plan);
    $("#plan_settings").scope().SaveFlightPlan(flight_plan);
    $http.post(server_host + '/fp/api/plans', JSON.stringify(flight_plan)).
      success(function(data, status, headers, config) {
        console.log(data);
    }).
    error(function(data, status, headers, config) {
      console.log(data);
    });
  };

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

function OpenDialogController($scope, $http, $mdDialog, $timeout) {
  $http.get(server_host + '/fp/api/plans', {'cache': false}).
    success(function(saved_plans, status, headers, config) {
      $scope.options = saved_plans
    }).error(function(data, status, headers, config) {
      console.log(data);
    });
  
  $scope.open = function() {
    $mdDialog.hide();
    var plan_name = $scope.chosenOption;

    $http.get(server_host + '/fp/api/plans/' + plan_name, {'cache': false}).
      success(function(flight_plan, status, headers, config) {
        $timeout(LoadFlightPlan(flight_plan));
      }).error(function(data, status, headers, config) {
        console.log(data);
      });
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

app.controller('PlanSettings', ['$scope', 'x2js',
    function PlanSettings($scope, x2js) {
  $scope.XmlTojson = function(xml) {
    return x2js.xml_str2json(xml);
  }
  $scope.default_settings = {
    'departure_elevation': NaN,
    'arrival_elevation': NaN,
    'fuel': NaN,
    'variance': NaN,
    'altimeter': NaN,
    'departure_oat': NaN,
    'cruise_oat': NaN,
    'arrival_oat': NaN,
  };
  $scope.settings = $scope.default_settings;
  $scope.LoadFlightPlan = function(flight_plan) {
    $scope.$apply(function() {
      $scope.settings = $scope.default_settings;
      for (var key in flight_plan.settings) {
        $scope.settings[key] = flight_plan.settings[key];
      }
    });
  };
  
  $scope.SaveFlightPlan = function(flight_plan) {
    flight_plan.settings = {}
    for (var key in $scope.settings) {
      flight_plan.settings[key] = $scope.settings[key];
    }
  };
}]);

app.controller('Waypoints', ['$scope', '$http', '$timeout', 'uiGridConstants',
               function ($scope, $http, $timeout, uiGridConstants) {
  
  $scope.LoadFlightPlan = function(flight_plan) {
    $scope.$apply(function() {
    $scope.gridOptions.data = [];
      for (var waypoint of flight_plan.waypoints) {
        $scope.gridOptions.data.push(waypoint);
      }
    });
  };
  
  $scope.SaveFlightPlan = function(flight_plan) {
    flight_plan.waypoints = [];
    for (waypoint of $scope.gridOptions.data) {
      flight_plan.waypoints.push({
        'notes': waypoint.notes,
        'waypoint': waypoint.waypoiny,
      });
    }
  };

  $scope.gridOptions = {
    'enableHorizontalScrollbar': uiGridConstants.scrollbars.NEVER,
    'enableVerticalScrollbar': uiGridConstants.scrollbars.NEVER,

    'columnDefs': [
      {
        name: 'notes',
        displayName: 'Notes',
        enableCellEdit: true,
        type: 'string',
        width: '50%'
      }, {
        name: 'waypoint',
        displayName: 'Waypoint',
        enableCellEdit: true,
        type: 'string',
        width: '50%'
      },
    ],
    'data': [{
      "notes": "Departure",
      "waypoint": "KPAO",
    }, {
      "notes": "OSI/073",
      "waypoint": "OSI",
    }, {
      "notes": "Destination",
      "waypoint": "KHAF",
    }],
  };
  
  FetchAndLoadGridTemplate($http, $scope, 'waypoints');
}]);

variance = -13.5;
windDir = 310;
windSpeed = 10;
ias = 100;
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
  return row.entity.ias * (1 + .02 * row.entity.altitude / 1000)
}

function calc_wca(row) {
  return degrees(
    Math.asin(
      Math.sin(
        radians(row.entity.windDir - calc_tc(row))
      ) * row.entity.windSpeed / calc_tas(row)));
}

function calc_mc(row) {
  return norm_angle(calc_tc(row) + variance);
}

function calc_mh(row) {
  return norm_angle(calc_mc(row) + calc_wca(row));
}

function calc_gs(row) {
  var tas = calc_tas(row);
  var windSpeed = row.entity.windSpeed;
  var windDir = row.entity.windDir;
  var tc = calc_tc(row);
  return Math.sqrt(
    Math.pow(tas, 2) + Math.pow(windSpeed, 2)
    - 2 * tas * windSpeed * Math.cos(radians(windDir - tc - calc_wca(row))));
}

function calc_ete(row) {
  return calc_dist(row) / calc_gs(row) * 60;
}

app.controller('Legs', ['$scope', '$http', '$timeout', 'uiGridConstants',
               function ($scope, $http, $timeout, uiGridConstants) {
               
  $scope.LoadFlightPlan = function(flight_plan) {
    $scope.gridOptions.data = [];
    $scope.$apply(function() {
      for (leg of flight_plan.legs) {
        $scope.gridOptions.data.push(leg);
      }
    });
  };

  $scope.SaveFlightPlan = function(flight_plan) {
    flight_plan.legs = [];
    for (leg of $scope.gridOptions.data) {
      flight_plan.legs.push({
        'lat_start': leg.lat_start,
        'lon_start': leg.lon_start,
        'lat_end': leg.lat_end,
        'lon_end': leg.lon_end,
        'windDir': leg.windDir,
        'windSpeed': leg.windSpeed,
        'ias': leg.ias,
        'altitude': leg.altitude});
    }
  };

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
        name: 'ias',
        displayName: 'IAS',
        enableCellEdit: true,
        type: 'number',
        enableColumnMenu: false,
        visible: false
      }, {
        name: 'lowAlt',
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
        enableColumnMenu: false
      }, {
        name: 'highAlt',
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
        enableColumnMenu: false
      }, {
        name: 'windDir',
        displayName: 'Wdir',
        enableCellEdit: true,
        type: 'number',
        enableColumnMenu: false
      }, {
        name: 'windSpeed',
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
      }, {name: 'mc',
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
        cellTemplate: '<div class="ui-grid-cell-contents">{{grid.appScope.CalcWca(row)}}</div>',
      }, {
        name: 'tas',
        displayName: 'TAS',
        enableCellEdit: false,
        type: 'number',
        enableColumnMenu: false,
        cellTemplate: '<div class="ui-grid-cell-contents">{{grid.appScope.CalcTas(row)}}</div>',
      }, {
        name: 'groundSpeed',
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
        enableColumnMenu: false
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
      },
    ],
    'data': [{
      'lowAlt': 20,
      'altitude': 3500,
      'highAlt': 40,
      'windDir': 290,
      'windSpeed': 10,
      'tc': 270,
      'distance': 8,
      'ias': 90,
    }, {
      'lowAlt': 10,
      'altitude': 2000,
      'highAlt': 40,
      'windDir': 270,
      'windSpeed': 15,
      'tc': 290,
      'distance': 10,
      'ias': 115,
    }],
  };
  
  FetchAndLoadGridTemplate($http, $scope, 'legs');
  
  $scope.gridOptions.onRegisterApi = function(gridApi){
          //set gridApi on scope
    $scope.gridApi = gridApi;
    gridApi.edit.on.afterCellEdit($scope, function(rowEntity, colDef,
                                                   newValue, oldValue) {
      $("#menu").scope().SaveFlightPlan();
    });
  };
}]);

function ConvertFpl(json_fpl, file_name) {
  var flight_plan = {
    'waypoints': [],
    'legs': [],
    'settings': [],
    'plan_name': file_name.split('.')[0],
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
        'windDir': windDir,
        'windSpeed': windSpeed,
        'ias': ias,
        'altitude': altitude,
      });
    }
  }
  return flight_plan;
}

function LoadFlightPlan(flight_plan) {
  $("#waypoints").scope().LoadFlightPlan(flight_plan);
  $("#legs").scope().LoadFlightPlan(flight_plan);
  $("#plan_settings").scope().LoadFlightPlan(flight_plan);
  $("#menu").scope().LoadFlightPlan(flight_plan);
}

$(document).ready(function(){
  $("#fpl_file").on('change', function() {
    var reader = new FileReader();
    var file = null;
    if ($("#fpl_file").length == 1 &&
        $("#fpl_file")[0].files.length == 1) {
      file = $("#fpl_file")[0].files[0];
    }
  
    reader.onload = function(e) {
      var json_fpl = $("#plan_settings").scope().XmlTojson(reader.result);
      flight_plan = ConvertFpl(json_fpl, file.name);
      LoadFlightPlan(flight_plan);
    };
    
    if (file != '') {
      reader.readAsText(file);
    }
  });
});
