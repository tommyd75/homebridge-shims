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
            "accessory": "FhemLockMechanism",
            "name": "main_door"
        },
        {
            "accessory": "FhemLockMechanism",
            "name": "garden_door"
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
  accessory: FhemLockMechanism
}

'use strict';

// Load url
var configPath = path.join(__dirname, "../config.json");
var config = JSON.parse(fs.readFileSync(configPath));
var url = config.global.url;
var port = config.global.port;
var base_url = 'http://' + url + ':' + port;
//console.log("base_url " + base_url);


function FhemLockMechanism(log, config) {
  this.log = log;
  this.name = config["name"];
  this.base_url = base_url;
  this.connection = { 'base_url': this.base_url, 'request': request };

  this.Characteristic = {};
  this.currentValue = {};

  this.longpoll_running = false;
  this.startLongpoll();
}

FhemLockMechanism.prototype = {

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
              case 'on':  fhemvalue = Characteristic.LockTargetState.SECURED; break;
              case 'off': fhemvalue = Characteristic.LockTargetState.UNSECURED; break;
            }            
            //this.log( 'Fhem onoff: ' + fhemvalue);
            
            if(fhemvalue != this.currentValue.LockTargetState) { 
              this.currentValue.LockTargetState = fhemvalue;        
              this.Characteristic.LockTargetState.setValue(fhemvalue);
            }
            break;
            
          case (this.name + '-currentState'):
          
            switch( parseInt(dataobj[1].match(/\d+/)) ) {
              case 0:   fhemvalue = Characteristic.LockCurrentState.UNSECURED; break;
              case 1:   fhemvalue = Characteristic.LockCurrentState.SECURED; break;
              case 2:   fhemvalue = Characteristic.LockCurrentState.JAMMED; break;
              case 3:   fhemvalue = Characteristic.LockCurrentState.UNKNOWN; break;
              default:  fhemvalue = Characteristic.LockCurrentState.UNKNOWN;
            }  
            
            if(fhemvalue != this.currentValue.LockCurrentState) { 
              this.currentValue.LockCurrentState = fhemvalue;
              this.Characteristic.LockCurrentState.setValue(fhemvalue);
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
  * Characteristic.LockCurrentState
  */
  
  getLockCurrentState: function(callback) {
  
    //this.log("Getting current state...");
    var cmd = '{ReadingsVal("' + this.name + '","currentState","")}';
    var fhem_url = this.base_url + '/fhem?cmd=' + cmd + '&XHR=1';

    request.get({url: fhem_url}, function(err, response, body) {
      //this.log('body: ' + body);
      if (!err && response.statusCode == 200) {
        var state = parseInt(body.trim());
        
        //this.log('getLockCurrentState: >' + state + '<');
        switch(state) {
          case 0:   this.currentValue.LockCurrentState = Characteristic.LockCurrentState.UNSECURED; break;
          case 1:   this.currentValue.LockCurrentState = Characteristic.LockCurrentState.SECURED; break;
          case 2:   this.currentValue.LockCurrentState = Characteristic.LockCurrentState.JAMMED; break;
          case 3:   this.currentValue.LockCurrentState = Characteristic.LockCurrentState.UNKNOWN; break;
          default:  this.currentValue.LockCurrentState = Characteristic.LockCurrentState.UNKNOWN;
        }  
        callback(null, this.currentValue.LockCurrentState);
      } 
      else {
        callback(err);
        this.log(err);
        if(response)
          this.log("statusCode: " + response.statusCode + " Message: " + response.statusMessage );
      }
    }.bind(this));
  },
  
  setLockCurrentState: null, // N/A
  

  /**
  * Characteristic.LockTargetState
  */

  getLockTargetState: function(callback) {
  
    // this.log('getLockTargetState');
    
    var cmd = '{ReadingsVal("' + this.name + '","state","")}';
    var fhem_url = this.base_url + '/fhem?cmd=' + cmd + '&XHR=1';

    request.get({url: fhem_url}, function(err, response, body) {
      //this.log('body: ' + body);
      if (!err && response.statusCode == 200) {
        var state = body.trim();
        if (state.match(/^[A-D]./))  // EnOcean
          state = state.slice(1,2);
        
        //this.log('getLockCurrentState: >' + state + '<');
                
        switch (state) {
          case  '0':
          case  'off':   this.currentValue.LockTargetState = Characteristic.LockTargetState.UNSECURED; break;
          case  'I':
          case  '1':
          case  'on':    this.currentValue.LockTargetState = Characteristic.LockTargetState.SECURED; break;
          default:      // nothing
        }
        callback(null, this.currentValue.LockTargetState);
      } 
      else {
        callback(err);
        this.log(err);
        if(response)
          this.log("statusCode: " + response.statusCode + " Message: " + response.statusMessage );
      }
    }.bind(this));
  },
  
  
  setLockTargetState: function(boolvalue, callback) {

    //this.log('setLockTargetState: ' + boolvalue);
    if (boolvalue == this.currentValue.LockTargetState) {
      callback();
      return;
    }
    
    var state = "";
    
    switch (boolvalue) {
      case 0:
      case false:       state = 'off'; break;
      case 1:
      case true:        state = 'on';  break; 
      default:          
        this.log("setPowerState: state undefined! boolvalue: >" + boolvalue + "<");
        callback();
        return;
    }
    
    var cmd = 'set ' + this.name + ' ' + state;
    //this.log("cmd: " + cmd);
    
    var fhem_url = this.base_url + '/fhem?cmd=' + cmd + '&XHR=1';    
    //this.log(fhem_url);
        
    request({url: fhem_url}, function(err, response, body) {

      if (!err && response.statusCode == 200) {
        this.currentValue.LockTargetState = boolvalue;
        callback();
        //this.log("setLockTargetState: " + this.currentValue.LockTargetState);
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
        
    var FhemLockMechanismService = new Service.LockMechanism();
    
    this.Characteristic.LockCurrentState = FhemLockMechanismService
      .getCharacteristic(Characteristic.LockCurrentState)
      .on('get', this.getLockCurrentState.bind(this));
    this.currentValue.LockCurrentState = Characteristic.LockCurrentState.UNSECURED;

    this.Characteristic.LockTargetState = FhemLockMechanismService
      .getCharacteristic(Characteristic.LockTargetState)
      .on('get', this.getLockTargetState.bind(this))
      .on('set', this.setLockTargetState.bind(this));
    this.currentValue.LockTargetState = Characteristic.LockTargetState.UNSECURED;
    
    return [informationService, FhemLockMechanismService];
  }
};
