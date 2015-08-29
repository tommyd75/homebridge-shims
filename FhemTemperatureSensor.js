// Description: Acceccory Shim to use with homebridge https://github.com/nfarina/homebridge
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
            "accessory": "FhemTemperatureSensor",
            "name": "temp_office"
        },
        {
            "accessory": "FhemTemperatureSensor",
            "name": "local_weather"
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
  accessory: FhemTemperatureSensor
}

'use strict';

// Load fhem-url
var configPath = path.join(__dirname, "../config.json");
var config = JSON.parse(fs.readFileSync(configPath));
var url = config.global.url;
var port = config.global.port;
var base_url = 'http://' + url + ':' + port;


function FhemTemperatureSensor(log, config) {
  this.log = log;
  this.name = config["name"];
  this.base_url = base_url;
  this.connection = { 'base_url': this.base_url, 'request': request };
  
  this.Characteristic = {};
  this.currentValue = {};
  
  this.longpoll_running = false;
  this.startLongpoll();
}

FhemTemperatureSensor.prototype = {

  /**
  * FHEM Longpoll
  */
  
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
      //this.log( 'data:\n'+ data);
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
        
        var reading = this.name + '-temperature';
        var fhemvalue;
        
        if (dataobj[0] == this.name || dataobj[0] == reading) {
          fhemvalue = parseFloat(dataobj[1].match(/[+-]?\d*\.?\d+/));
          if(fhemvalue != this.currentValue.CurrentTemperature) {
            this.currentValue.CurrentTemperature = fhemvalue;      
            this.Characteristic.CurrentTemperature.setValue(fhemvalue);
            //this.log( 'fhemvalue: ' + fhemvalue);
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

  /**
  * Characteristic.CurrentTemperature
  */
  
  getCurrentTemperature: function(callback) {
    
    //this.log("Getting current temperature ...");
    var cmd = '{ReadingsVal("' + this.name + '","temperature","")}';
    var fhem_url = this.base_url + '/fhem?cmd=' + cmd + '&XHR=1';

    request.get({url: fhem_url}, function(err, response, body) {
      
      if (!err && response.statusCode == 200) {
        this.currentValue.CurrentTemperature = parseFloat(body.trim());
        //this.log('temperature: ' + this.currentValue.CurrentTemperature);
        callback(null, this.currentValue.CurrentTemperature);
      } 
      else {
        callback(err);
        this.log(err);
        if(response)
          this.log("statusCode: " + response.statusCode + " Message: " + response.statusMessage );
      }
    }.bind(this));
  },
  
  setCurrentTemperature: null, // N/A
  
  /**
  * Accessory Information Identify 
  */
  
  identify: function(callback) {
    this.log("Identify requested!");
    callback();
  },
  
  /**
  * Services and Characteristics
  */
  
  getServices: function() {
  
    var informationService = new Service.AccessoryInformation();
    
    informationService
      .setCharacteristic(Characteristic.Manufacturer, "FHEM Manufacturer")
      .setCharacteristic(Characteristic.Model, "FHEM Model")
      .setCharacteristic(Characteristic.SerialNumber, "FHEM Serial Number")
      .setCharacteristic(Characteristic.Name, this.name);
      
    var FhemTemperatureSensorService = new Service.TemperatureSensor();
    
    this.Characteristic.CurrentTemperature = FhemTemperatureSensorService
      .getCharacteristic(Characteristic.CurrentTemperature)
      .on('get', this.getCurrentTemperature.bind(this));
    this.currentValue.CurrentTemperature = 0;
    
    return [informationService, FhemTemperatureSensorService];
  }
};