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
            "accessory": "FhemGarageDoorOpener",
            "name": "garage_door"
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
  accessory: FhemGarageDoorOpener
}

'use strict';

// Load url
var configPath = path.join(__dirname, "../config.json");
var config = JSON.parse(fs.readFileSync(configPath));
var url = config.global.url;
var port = config.global.port;
var base_url = 'http://' + url + ':' + port;
//console.log("base_url " + base_url);


function FhemGarageDoorOpener(log, config) {
  this.log = log;
  this.name = config["name"];
  this.base_url = base_url;
  this.connection = { 'base_url': this.base_url, 'request': request };

  this.Characteristic = {};
  this.currentValue = {};

  this.longpoll_running = false;
  this.startLongpoll();
}

FhemGarageDoorOpener.prototype = {

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
        
        switch (dataobj[0]) {

          case (this.name):
          
            switch(dataobj[1]) {
              case 'off': fhemvalue = Characteristic.TargetDoorState.OPEN; break;
              case 'on':  fhemvalue = Characteristic.TargetDoorState.CLOSED; break;
            }            
            //this.log( 'Fhem onoff: ' + fhemvalue);
            
            if(fhemvalue != this.currentValue.TargetDoorState) { 
              this.currentValue.TargetDoorState = fhemvalue;        
              this.Characteristic.TargetDoorState.setValue(fhemvalue);
            }
            break;
            
          case (this.name + '-currentState'):
          
            switch( parseInt(dataobj[1].match(/\d+/)) ) {
              case 0:   fhemvalue = Characteristic.CurrentDoorState.OPEN; break;
              case 1:   fhemvalue = Characteristic.CurrentDoorState.CLOSED; break;
              case 2:   fhemvalue = Characteristic.CurrentDoorState.OPENEING; break;
              case 3:   fhemvalue = Characteristic.CurrentDoorState.CLOSING; break;
              case 4:   fhemvalue = Characteristic.CurrentDoorState.STOPPED; break;
              default:  // nothing
            }  
            
            if(fhemvalue != this.currentValue.CurrentDoorState) { 
              this.currentValue.CurrentDoorState = fhemvalue;
              this.Characteristic.CurrentDoorState.setValue(fhemvalue);
            }
            break;
            
          case (this.name + '-obstruction'):
          
            switch( parseInt(dataobj[1].match(/\d+/)) ) {
              case 0:   fhemvalue = false; break;
              case 1:   fhemvalue = true; break;
              default:  // nothing
            } 
            
            if(fhemvalue != this.currentValue.ObstructionDetected) { 
              this.currentValue.ObstructionDetected = fhemvalue;
              this.Characteristic.ObstructionDetected.setValue(fhemvalue);
            }
            break;
          default:
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
  * Characteristic.CurrentDoorState
  */
  
  getCurrentDoorState: function(callback) {
  
    //this.log("Getting current state...");
    var cmd = '{ReadingsVal("' + this.name + '","currentState","")}';
    var fhem_url = this.base_url + '/fhem?cmd=' + cmd + '&XHR=1';

    request.get({url: fhem_url}, function(err, response, body) {
      //this.log('body: ' + body);
      if (!err && response.statusCode == 200) {
        var state = parseInt(body.trim());
        
        //this.log('getCurrentDoorState: >' + state + '<');
        switch(state) {
          case 0:   this.currentValue.CurrentDoorState = Characteristic.CurrentDoorState.OPEN; break;
          case 1:   this.currentValue.CurrentDoorState = Characteristic.CurrentDoorState.CLOSED; break;
          case 2:   this.currentValue.CurrentDoorState = Characteristic.CurrentDoorState.OPENEING; break;
          case 3:   this.currentValue.CurrentDoorState = Characteristic.CurrentDoorState.CLOSING; break;
          case 4:   this.currentValue.CurrentDoorState = Characteristic.CurrentDoorState.STOPPED; break;
          default:  // nothing
        }  
        callback(null, this.currentValue.CurrentDoorState);
      } 
      else {
        callback(err);
        this.log(err);
        if(response)
          this.log("statusCode: " + response.statusCode + " Message: " + response.statusMessage );
      }
    }.bind(this));
  },
  
  setCurrentDoorState: null, // N/A
  

  /**
  * Characteristic.TargetDoorState
  */

  getTargetDoorState: function(callback) {
  
    // this.log('getTargetDoorState');
    
    var cmd = '{ReadingsVal("' + this.name + '","state","")}';
    var fhem_url = this.base_url + '/fhem?cmd=' + cmd + '&XHR=1';

    request.get({url: fhem_url}, function(err, response, body) {
      //this.log('body: ' + body);
      if (!err && response.statusCode == 200) {
        var state = body.trim();
        
        //this.log('getCurrentDoorState: >' + state + '<');
                
        switch(state) {
          case 'off':  this.currentValue.TargetDoorState = Characteristic.TargetDoorState.OPEN; break;
          case 'on':   this.currentValue.TargetDoorState = Characteristic.TargetDoorState.CLOSED; break;
          default:  
        }  
        callback(null, this.currentValue.TargetDoorState);
      } 
      else {
        callback(err);
        this.log(err);
        if(response)
          this.log("statusCode: " + response.statusCode + " Message: " + response.statusMessage );
      }
    }.bind(this));
  },
  
  
  setTargetDoorState: function(value, callback) {

    //this.log('setTargetDoorState: ' + value);
    if (value == this.currentValue.TargetDoorState) {
      callback();
      return;
    }
    
    var state = "";
    
    switch (value) {
      case Characteristic.TargetDoorState.OPEN: state = 'off'; break;
      case Characteristic.TargetDoorState.CLOSED: state = 'on';  break
      default:          
        this.log("setPowerState: state undefined! value: >" + value + "<");
        callback();
        return; 
    }
    
    var cmd = 'set ' + this.name + ' ' + state;
    //this.log("cmd: " + cmd);
    
    var fhem_url = this.base_url + '/fhem?cmd=' + cmd + '&XHR=1';    
    //this.log(fhem_url);
        
    request({url: fhem_url}, function(err, response, body) {

      if (!err && response.statusCode == 200) {
        this.currentValue.TargetDoorState = value;
        callback();
        //this.log("setTargetDoorState: " + this.currentValue.TargetDoorState);
      }
      else {
        callback(err)
        this.log(err);
        if(response)
          this.log("statusCode: " + response.statusCode + " Message: " + response.statusMessage );
      }
    }.bind(this));
  },
  
  /**
  * Characteristic.ObstructionDetected
  */
  
  getObstructionDetected: function(callback) {
  
    //this.log("Getting current state...");
    var cmd = '{ReadingsVal("' + this.name + '","obstruction","")}';
    var fhem_url = this.base_url + '/fhem?cmd=' + cmd + '&XHR=1';

    request.get({url: fhem_url}, function(err, response, body) {
      //this.log('body: ' + body);
      if (!err && response.statusCode == 200) {
        var state = parseInt(body.trim());
        
        //this.log('getCurrentDoorState: >' + state + '<');
        switch (state) {
          case  '0':
          case  'off':   this.currentValue.ObstructionDetected = false; break;
          case  '1':
          case  'on':    this.currentValue.ObstructionDetected = true; break;
          default:      // nothing
        }
        callback(null, this.currentValue.ObstructionDetected);
      } 
      else {
        callback(err);
        this.log(err);
        if(response)
          this.log("statusCode: " + response.statusCode + " Message: " + response.statusMessage );
      }
    }.bind(this));
  },
  
  setObstructionDetected: null, // N/A
  
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
        
    var FhemGarageDoorOpenerService = new Service.GarageDoorOpener();
    
    this.Characteristic.CurrentDoorState = FhemGarageDoorOpenerService
      .getCharacteristic(Characteristic.CurrentDoorState)
      .on('get', this.getCurrentDoorState.bind(this));
    
    // The value property of CurrentDoorState must be one of the following:
    // Characteristic.CurrentDoorState.OPEN = 0;
    // Characteristic.CurrentDoorState.CLOSED = 1;
    // Characteristic.CurrentDoorState.OPENING = 2;
    // Characteristic.CurrentDoorState.CLOSING = 3;
    // Characteristic.CurrentDoorState.STOPPED = 4;
    this.currentValue.CurrentDoorState = Characteristic.CurrentDoorState.OPEN;

    this.Characteristic.TargetDoorState = FhemGarageDoorOpenerService
      .getCharacteristic(Characteristic.TargetDoorState)
      .on('get', this.getTargetDoorState.bind(this))
      .on('set', this.setTargetDoorState.bind(this));
      
    // The value property of TargetDoorState must be one of the following:
    // Characteristic.TargetDoorState.OPEN = 0;
    // Characteristic.TargetDoorState.CLOSED = 1;
    this.currentValue.TargetDoorState = Characteristic.TargetDoorState.OPEN;
    
    this.Characteristic.ObstructionDetected = FhemGarageDoorOpenerService
      .getCharacteristic(Characteristic.ObstructionDetected)
      .on('get', this.getObstructionDetected.bind(this))
    this.currentValue.ObstructionDetected = false;
    
    return [informationService, FhemGarageDoorOpenerService];
  }
};
