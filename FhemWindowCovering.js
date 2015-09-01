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
            "accessory": "FhemWindowCovering",
            "name": "garden_blind"
        },
        {
            "accessory": "FhemWindowCovering",
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
  accessory: FhemWindowCovering
}

'use strict';

// Load url
var configPath = path.join(__dirname, "../config.json");
var config = JSON.parse(fs.readFileSync(configPath));
var url = config.global.url;
var port = config.global.port;
var base_url = 'http://' + url + ':' + port;
//console.log("base_url " + base_url);


function FhemWindowCovering(log, config) {
  this.log = log;
  this.name = config["name"];
  this.base_url = base_url;
  this.connection = { 'base_url': this.base_url, 'request': request };
  
  this.currentCharacteristic = {};
  this.currentValue = {};


  this.longpoll_running = false;
  this.startLongpoll();
}

FhemWindowCovering.prototype = {

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
        
        var fhemvalue;
        
        //this.log("dataset: " + dataset);
        //this.log('dataobj: ' + dataobj[0] + ', ' + dataobj[1]);
       
        switch (dataobj[0]) {
           
          case (this.name):
            fhemvalue = parseInt(dataobj[1].match(/\d+/));
            
            if(fhemvalue != this.currentValue.TargetPosition) { 
              //this.log( 'fhemvalue: ' + fhemvalue);
              this.currentValue.TargetPosition = fhemvalue;        
              this.currentCharacteristic.TargetPosition.setValue(fhemvalue);
            }
            break;
            
          case (this.name + '-PositionState'):
            switch( parseInt(dataobj[1].match(/\d+/)) ) {
              case 0:   fhemvalue = Characteristic.PositionState.DECREASING; break;
              case 1:   fhemvalue = Characteristic.PositionState.INCREASING; break;
              case 2:   fhemvalue = Characteristic.PositionState.STOPPED; break;
              default:  // nothing
            }  
            
            if(fhemvalue != this.currentValue.PositionState) { 
              this.currentValue.PositionState = fhemvalue;
              this.Characteristic.PositionState.setValue(fhemvalue);
            }
            break;
            
            case (this.name + '-currentPosition'):
            fhemvalue = parseInt(dataobj[1].match(/\d+/));
            
            if(fhemvalue != this.currentValue.CurrentPosition) { 
              //this.log( 'fhemvalue: ' + fhemvalue);
              this.currentValue.CurrentPosition = fhemvalue;        
              this.currentCharacteristic.CurrentPosition.setValue(fhemvalue);
            }
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
  
  /**
  * Characteristic.CurrentPosition
  */
  
  getCurrentPosition: function(callback) {
  
    var cmd = '{ReadingsVal("' + this.name + '","currentPosition","")}'; 
    var fhem_url = this.base_url + '/fhem?cmd=' + cmd + '&XHR=1';
    
    request.get({url: fhem_url}, function(err, response, body) {
      
      if (!err && response.statusCode == 200) {
        //this.log('body: ' + body);
        this.currentValue.CurrentPosition = parseInt(body.trim());
        //this.log('getCurrentPosition: ' + this.currentValue.CurrentPosition);
        callback(null, this.currentValue.CurrentPosition);
        
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
  
  /**
  * Characteristic.TargetPosition
  */
  
  getTargetPosition: function(callback) {
  
    var cmd = '{ReadingsVal("' + this.name + '","state","")}'; 
    var fhem_url = this.base_url + '/fhem?cmd=' + cmd + '&XHR=1';
    
    request.get({url: fhem_url}, function(err, response, body) {
      
      if (!err && response.statusCode == 200) {
        this.currentValue.TargetPosition = parseInt(body.trim());
        //this.log('getTargetPosition: ' + this.currentValue.TargetPosition);
        callback(null, this.currentValue.TargetPosition);
      } 
      else {
        callback(err);
        this.log(err);
        if(response)
          this.log("statusCode: " + response.statusCode + " Message: " + response.statusMessage );
      }
    }.bind(this));
  },
  
  setTargetPosition: function(value, callback) {

    this.log('setTargetPosition: ' + value);
    callback();
    
    // todo  !!! issue: control grayed out
    
    /*
    if(this.timeoutObj) {
      clearTimeout(this.timeoutObj);
    }
    
    var cmd = 'set ' + this.name + ' dim ' + value;
    //this.log("cmd: " + cmd);
     
    this.timeoutObj =  = setTimeout(function() { 
      clearTimeout(timer);
      this.sendCmd(cmd); 
      //this.log("setBrightness: " + value); 
    }.bind(this), delay);
    */
    
  },
  
  /**
  * Characteristic.PositionState
  */
    
  getPositionState: function(callback) {
      
    var cmd = '{ReadingsVal("' + this.name + '","currentPosition","")}';
    var fhem_url = this.base_url + '/fhem?cmd=' + cmd + '&XHR=1';

    request.get({url: fhem_url}, function(err, response, body) {
      //this.log('body: ' + body);
      if (!err && response.statusCode == 200) {
        var state = parseInt(body.trim());
        
        //this.log('getPositionState: ' + state);
        switch(state) {
          case 0:   this.currentValue.PositionState = Characteristic.PositionState.DECREASING; break;
          case 1:   this.currentValue.PositionState = Characteristic.PositionState.INCREASING; break;
          case 2:   this.currentValue.PositionState = Characteristic.PositionState.STOPPED; break;
          default:  // nothing
        }  
        callback(null, this.currentValue.PositionState);
      } 
      else {
        callback(err);
        this.log(err);
        if(response)
          this.log("statusCode: " + response.statusCode + " Message: " + response.statusMessage );
      }
    }.bind(this));
    
    // todo
  },
  
  setPositionState: null,  // N/S
  
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
  
  /**
 * Service "Window Covering"
 */
 
  getServices: function() {
  
    var informationService = new Service.AccessoryInformation();
    
    informationService
      .setCharacteristic(Characteristic.Manufacturer, "FHEM Manufacturer")
      .setCharacteristic(Characteristic.Model, "FHEM Model")
      .setCharacteristic(Characteristic.SerialNumber, "FHEM Serial Number")
      .setCharacteristic(Characteristic.Name, this.name);
      
    var FhemWindowCoveringService = new Service.WindowCovering();
    
    this.currentCharacteristic.CurrentPosition = FhemWindowCoveringService
      .getCharacteristic(Characteristic.CurrentPosition)
      .on('get', this.getCurrentPosition.bind(this));
    this.currentValue.CurrentPosition = 0;  // 0 .. 100

    this.currentCharacteristic.TargetPosition = FhemWindowCoveringService
      .getCharacteristic(Characteristic.TargetPosition)
      .on('get', this.getTargetPosition.bind(this))
      .on('set', this.setTargetPosition.bind(this));
    this.currentValue.TargetPosition = 0;  // 0 .. 100
      
    this.currentCharacteristic.PositionState = FhemWindowCoveringService
      .getCharacteristic(Characteristic.PositionState)
      .on('get', this.getPositionState.bind(this));
      
    // The value property of PositionState must be one of the following:
    // Characteristic.PositionState.DECREASING = 0;
    // Characteristic.PositionState.INCREASING = 1;
    // Characteristic.PositionState.STOPPED = 2;
    this.currentValue.PositionState = Characteristic.PositionState.STOPPED;
    

      
    return [informationService, FhemWindowCoveringService];
  }
};
