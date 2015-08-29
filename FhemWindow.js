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
            "accessory": "FhemWindow",
            "name": "garden_blind"
        },
        {
            "accessory": "FhemWindow",
            "name": "bathroom_blind"
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
  accessory: FhemWindow
}

'use strict';

// Load url
var configPath = path.join(__dirname, "../config.json");
var config = JSON.parse(fs.readFileSync(configPath));
var url = config.global.url;
var port = config.global.port;
var base_url = 'http://' + url + ':' + port;
//console.log("base_url " + base_url);


function FhemWindow(log, config) {
  this.log = log;
  this.name = config["name"];
  this.base_url = base_url;
  this.connection = { 'base_url': this.base_url, 'request': request };

  this.CurPos = 0;
  this.TarPos = 0;
  this.OpeSta = 0;  
  this.currentValue = false;
  
  this.currentCharacteristic = {};


  this.longpoll_running = false;
  this.startLongpoll();
}

FhemWindow.prototype = {

  startLongpoll: function() {
  
    if( this.longpoll_running )
      return;
    
    this.longpoll_running = true;

    var since = "null";
    var query = "/fhem.pl?XHR=1&inform=type=status;filter=" + this.name + ";since=" + since + 
    ";fmt=JSON&timestamp=" + Date.now();
    var url = encodeURI( this.connection.base_url + query );
    this.log( 'starting longpoll: ' + url );

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
        
        var fhemvalue = dataobj[1];
        
        //this.log("dataset: " + dataset);
        //this.log('dataobj: ' + dataobj[0] + ', ' + dataobj[1]);
       
        switch (dataobj[0]) {
        
          case (this.name + '-onoff'):
          
            switch(fhemvalue) {
              case 'on':
                this.currentValue = true;
                //this.currentCharacteristic['PowerState'].setValue(true);
                break;
                
              case 'off':
                this.currentValue = false;
                //this.currentCharacteristic['PowerState'].setValue(false);
                break;
                
              default: // nothing
            }
            break;
          
          case (this.name + '-pct'):
            this.CurPos = parseInt(fhemvalue.match(/\d+/));
            this.log("pct: " + this.CurPos);
            this.currentCharacteristic['CurPos'].setValue(this.CurPos);

            break;
          default: // nothing
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
          case  'off':   this.currentValue = false; break;
          case  'I':
          case  '1':
          case  'on':    this.currentValue = true; break;
          default:      // nothing
        }
        callback(null, this.currentValue);
      } 
      else {
        callback(err);
        this.log(err);
        if(response)
          this.log("statusCode: " + response.statusCode + " Message: " + response.statusMessage );
      }
    }.bind(this));
  },
  
  setPowerState: function(powerOn, callback) {
    
    //this.log("setPowerState: " + powerOn);
    if (powerOn == this.currentValue) {
      callback();
      return;
    }
    
    var state = "";
    
    switch (powerOn) {
      case 0:
      case false:       state = 'off'; break;
      case 1:
      case true:        state = 'on';  break; 
      default:          
        this.log("setPowerState: state undefined! powerOn: >" + powerOn + "<");
        callback();
        return;
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
      } 
      else {
        callback(err)
        this.log(err);
        if(response)
          this.log("statusCode: " + response.statusCode + " Message: " + response.statusMessage );
      }
    }.bind(this));
  },
  
  getCurrentPosition: function(callback) {
  
    var cmd = '{ReadingsVal("' + this.name + '","pct","")}';
    var fhem_url = this.base_url + '/fhem?cmd=' + cmd + '&XHR=1';
    
    request.get({url: fhem_url}, function(err, response, body) {
      
      if (!err && response.statusCode == 200) {
        this.CurPos = parseInt(body.trim());
        this.log('getCurrentPosition: ' + this.CurPos);
        callback(null, this.CurPos);
        
      } 
      else {
        callback(err);
        this.log(err);
        if(response)
          this.log("statusCode: " + response.statusCode + " Message: " + response.statusMessage );
      }
    }.bind(this));
  },
  
  setCurrentPosition: null, // N/A
  
  getTargetPosition: function(callback) {
  
    var cmd = '{ReadingsVal("' + this.name + '","pct","")}';  // todo Target in ZWave ?
    var fhem_url = this.base_url + '/fhem?cmd=' + cmd + '&XHR=1';
    
    request.get({url: fhem_url}, function(err, response, body) {
      
      if (!err && response.statusCode == 200) {
        this.TarPos = parseInt(body.trim());
        this.log('getTargetPosition: ' + this.TarPos);
        callback(null, this.TarPos);
      } 
      else {
        callback(err);
        this.log(err);
        if(response)
          this.log("statusCode: " + response.statusCode + " Message: " + response.statusMessage );
      }
    }.bind(this));
  },
 
  setTargetPosition: function(value) {

    this.log('setTargetPosition: ' + value);
    callback();
    
    /*
    var timer;
    if(timer) {
      clearTimeout(timer);
    }
    
    var cmd = 'set ' + this.name + ' dim ' + value;
    //this.log("cmd: " + cmd);
     
    timer = setTimeout(function() { 
      clearTimeout(timer);
      this.sendCmd(cmd); 
      //this.log("setBrightness: " + value); 
    }.bind(this), delay);
    */
  },
  
    
  getPositionState: function(callback) {
  
    this.log('getPositionState');
    callback(null,0); // todo 0,1,2
  },
  
  setPositionState: function(value) {
  
    this.log('setPositionState: ' + value);
    callback();
  },
  
  getServices: function() {
  
    var informationService = new Service.AccessoryInformation();
    
    informationService
      .setCharacteristic(Characteristic.Manufacturer, "FHEM Manufacturer")
      .setCharacteristic(Characteristic.Model, "FHEM Model")
      .setCharacteristic(Characteristic.SerialNumber, "FHEM Serial Number")
      .setCharacteristic(Characteristic.Name, this.name);
  
    var FhemWindowService = new Service.WindowCovering();
    
    this.currentCharacteristic['CurPos'] = FhemWindowService
      .getCharacteristic(Characteristic.CurrentPosition)
      .on('get', this.getCurrentPosition.bind(this));
      
    this.currentCharacteristic['TarPos'] = FhemWindowService
      .getCharacteristic(Characteristic.TargetPosition)
      .on('get', this.getTargetPosition.bind(this))
      .on('set', this.setTargetPosition.bind(this));
      
    this.currentCharacteristic['PosSta'] = FhemWindowService
      .getCharacteristic(Characteristic.PositionState)
      .on('get', this.getPositionState.bind(this))
      .on('set', this.setPositionState.bind(this));
      
    return [informationService, FhemWindowService];
  }
};