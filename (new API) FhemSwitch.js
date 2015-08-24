// Description: Acceccory Shim to use with homebridge https://github.com/nfarina/homebridge
// Branch: support-new-api
// Copy this file into the folder: homebridge/accessories

/* config.json Example:
{   
    "global": {
        "url": "127.0.0.1",
        "port": "8083"
    },
        
    "bridge": {
        "name": "Homebridge",
        "username": "CC:22:3D:E3:CE:27",
        "port": 51826,
        "pin": "031-45-154"
    },

    "platforms": [],                        
                          
    "accessories": [
        {
            "accessory": "FhemSwitch",
            "name": "flex_lamp"
        },
        {
            "accessory": "FhemSwitch",
            "name": "dining_floorlamp"
        }
    ]                      
}
*/

var Service = require("HAP-NodeJS").Service;
var Characteristic = require("HAP-NodeJS").Characteristic;
var request = require("request");

var fs = require('fs');
var path = require('path');

module.exports = {
  accessory: FhemSwitch
}

'use strict';

// Load url
var configPath = path.join(__dirname, "../config.json");
var config = JSON.parse(fs.readFileSync(configPath));
var url = config.global.url;
var port = config.global.port;
var base_url = 'http://' + url + ':' + port;
//console.log("base_url " + base_url);


function FhemSwitch(log, config) {
  this.log = log;
  this.name = config["name"];
  this.base_url = base_url;
  this.connection = { 'base_url': this.base_url, 'request': request };

  this.currentCharacteristic;
  this.currentValue = false;

  this.longpoll_running = false;
  this.startLongpoll();
}

FhemSwitch.prototype = {

  startLongpoll: function() {
  
    if( this.longpoll_running )
      return;
    
    this.longpoll_running = true;

    var since = "null";
    var query = "/fhem.pl?XHR=1&inform=type=status;filter=" + this.name + ";since=" + since + 
    ";fmt=JSON&timestamp=" + Date.now();
    var url = encodeURI( this.connection.base_url + query );
    //this.log( 'starting longpoll: ' + url );

    var offset = 0;
    var datastr = "";
    
    this.connection.request.get( { url: url } ).on( 'data', function(data) {
      //this.log( 'data: >'+ data + '<');
      if( !data ) 
        return;

      datastr += data;

      for(;;) {
      
        var nIndex = datastr.indexOf("\n", offset);
        if(nIndex < 0) 
          break; // exit for-loop
         
        var dataset = datastr.substr(offset, nIndex-offset);
        
        offset = nIndex + 1;
        if(!dataset.length)
          continue;
        
        var dataobj = JSON.parse(dataset);
        
        //this.log("dataset: " + dataset);
        //this.log('dataobj: ' + dataobj[0] + ', ' + dataobj[1]);
        
        var fhemvalue;
        if (dataobj[0] == this.name) {
          switch (dataobj[1]) {
            case 'on':  fhemvalue = true; break;
            case 'off': fhemvalue = false; break;
          }
          
          if(fhemvalue != this.currentValue) { 
            //this.log( 'fhemvalue: ' + fhemvalue);
            this.currentValue = fhemvalue;        
            this.currentCharacteristic.setValue(fhemvalue);
          }
        }
      }
      
      datastr = datastr.substr(offset);
      offset = 0;

    }.bind(this) ).on( 'end', function() {
      this.log( "longpoll ended" );

      this.longpoll_running = false;
      setTimeout( function(){this.startLongpoll()}.bind(this), 2000 );

    }.bind(this) ).on( 'error', function(err) {
      this.log( "longpoll error: " + err );

      this.longpoll_running = false;
      setTimeout( function(){this.startLongpoll()}.bind(this), 5000 );
    }.bind(this) );
  },
  
  setPowerState: function(powerOn, callback) {
    
    //this.log("setPowerState: " + powerOn);
    
    var state = "";
    
    switch (powerOn) {
      case 0:
      case false:       state = 'off'; break;
      case 1:
      case true:        state = 'on';  break; 
      default:          this.log("setPowerState: state undefined! powerOn: >" + powerOn + "<");
    }
    
    var cmd = 'set ' + this.name + ' ' + state;
    //this.log("cmd: " + cmd);
    
    var fhem_url = this.base_url + '/fhem?cmd=' + cmd + '&XHR=1';    
    //this.log(fhem_url);
        
    request({url: fhem_url}, function(err, response, body) {

      if (!err && response.statusCode == 200) {
        this.currentValue = powerOn;
        callback();
        //this.log("State change complete.");
      } else {
        this.log(err);
        callback(err)
        if(response)
          this.log("statusCode: " + response.statusCode + " Message: " + response.statusMessage );
      }
    }.bind(this));
  },
    
  getPowerState: function(callback) {
    
    //this.log("Getting current state...");
    var cmd = '{ReadingsVal("' + this.name + '","state","")}';
    var fhem_url = this.base_url + '/fhem?cmd=' + cmd + '&XHR=1';

    request.get({url: fhem_url}, function(err, response, body) {
      //this.log('body: ' + body);
      if (!err && response.statusCode == 200) {
        var state = body.trim();
        if (state.match(/^[A-D]./))  // EnOcean
          state = state.slice(1,2);
        
        //this.log('getPowerState: >' + state + '<');
                
        switch (state) {
          case  '0':
          case  'off':  callback(null, false); break;
          case  'I':
          case  '1':
          case  'on':   callback(null, true); break;
          default:      // nothing
        }
        
      } else {
        this.log(err);
        callback(err);
        if(response)
          this.log("statusCode: " + response.statusCode + " Message: " + response.statusMessage );
      }
    }.bind(this));
  },
  
  identify: function(callback) {
    //this.log("Identify requested!");
    
    var cmd = 'set ' + this.name + ' ' + 'on-for-timer 2';
    //this.log("cmd: " + cmd);
    
    var fhem_url = this.base_url + '/fhem?cmd=' + cmd + '&XHR=1';    
    //this.log(fhem_url);
        
    request({url: fhem_url}, function(err, response, body) {

      if (!err && response.statusCode == 200) {
        callback();
        //this.log("State change complete.");
      } else {
        this.log(err);
        callback(err)
        if(response)
          this.log("statusCode: " + response.statusCode + " Message: " + response.statusMessage );
      }
    }.bind(this));
  },
  
  getServices: function() {
    
    var informationService = new Service.AccessoryInformation();
    
    informationService
      .setCharacteristic(Characteristic.Manufacturer, "FHEM Manufacturer")
      .setCharacteristic(Characteristic.Model, "FHEM Model")
      .setCharacteristic(Characteristic.SerialNumber, "FHEM Serial Number")
      .setCharacteristic(Characteristic.Name, this.name);
        
    var FhemSwitchService = new Service.Switch();
    
    this.currentCharacteristic = FhemSwitchService
      .getCharacteristic(Characteristic.On)
      .on('get', this.getPowerState.bind(this))
      .on('set', this.setPowerState.bind(this));
      
    return [informationService, FhemSwitchService];
  }
};