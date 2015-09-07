// Description: Acceccory Shim to use with homebridge https://github.com/nfarina/homebridge
// Copy this file into the folder: homebridge/accessories

/*
For ZWave FIBARO System FGRM-222 Roller Shutter 2
The following attribute in fhem.cfg has to be added (replace bathroom_blind with the name of your device):

attr bathroom_blind userReadings onoff {ReadingsVal("bathroom_blind","state","")=~/^on|^off/?ReadingsVal("bathroom_blind","state",""):ReadingsVal("bathroom_blind","onoff","")},
  dim  {ReadingsVal("bathroom_blind","state","")=~/^dim/?
  ReadingsNum("bathroom_blind","state",""):ReadingsVal("bathroom_blind","state","")=~/^off/?
  0:ReadingsVal("bathroom_blind","state","")=~/'^on/?99:ReadingsVal("bathroom_blind","dim","")},  
  positionSlat {ReadingsVal("bathroom_blind","state","")=~/^positionSlat/?
  ReadingsNum("bathroom_blind","state",""):ReadingsVal("bathroom_blind","positionSlat","")}
*/


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
            "accessory": "FhemFibaroRollerShutter",
            "name": "garden_blind"
            "slat": "false"
        },
        {
            "accessory": "FhemFibaroRollerShutter",
            "name": "bathroom_blind",
            "slat": "true"
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
  accessory: FhemFibaroRollerShutter
}

'use strict';

/**
* Load url
*/
  
var configPath = path.join(__dirname, "../config.json");
var config = JSON.parse(fs.readFileSync(configPath));
var url = config.global.url;
var port = config.global.port;
var base_url = 'http://' + url + ':' + port;
//console.log("base_url " + base_url);

/**
* Accessory: FhemFibaroRollerShutter
*/

function FhemFibaroRollerShutter(log, config) {
  //this.log = log;
  this.log = this.mylog;
  this.name = config["name"];
  this.slat = JSON.parse(config["slat"]);
  
  this.base_url = base_url;
  this.connection = { 'base_url': this.base_url, 'request': request };
  
  this.Characteristic = {};
  this.currentValue = {};
  
  this.longpoll_running = false;
  this.startLongpoll();
}

FhemFibaroRollerShutter.prototype = {

  /**
  * FHEM mylog
  */
  
  mylog: function mylog(msg) {
    var now = new Date().toLocaleString();
    var logmsg = now + " [" + this.name + "] " + msg;
    console.log(logmsg);
  },
  
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
        var reading;
        
        switch (dataobj[0]) {
          case (this.name + '-onoff'):
          
            switch(dataobj[1]) {
              case 'on':  fhemvalue = true; break;
              case 'off': fhemvalue = false; break;
            }
            
            if(fhemvalue != this.currentValue.On) { 
              this.log( 'Fhem onoff: ' + fhemvalue);
              this.currentValue.On = fhemvalue;
              this.Characteristic.On.setValue(fhemvalue);
            }           
            break;
          
          case (this.name + '-dim'):
            fhemvalue = parseInt(dataobj[1]);
          
            // Fibaro FGRM-222
            switch (fhemvalue) {
              case 1:   fhemvalue = 0; break;
              case 99:  fhemvalue = 100; break;
              default:  // nothing
            }
                          
            if(fhemvalue != this.currentValue.BlindPosition) {
              this.log( 'Fhem BlindPosition: ' + fhemvalue);
              this.currentValue.BlindPosition = fhemvalue;
              this.Characteristic.BlindPosition.setValue(fhemvalue);
            }
            break;
            
          case (this.name + '-positionSlat'):
            fhemvalue = parseInt(dataobj[1]);
          
            // Fibaro FGRM-222
            fhemvalue = parseInt(fhemvalue / 0.9);
                          
            if(fhemvalue != this.currentValue.SlatPosition) {
              this.log( 'Fhem SlatPosition: ' + fhemvalue);
              this.currentValue.SlatPosition = fhemvalue;
              this.Characteristic.SlatPosition.setValue(fhemvalue);
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
  * Characteristic.On
  */
  
  getPowerState: function(callback) {
    
    //this.log("Getting current state...");
    var cmd = '{ReadingsVal("' + this.name + '","onoff","")}';
    var fhem_url = this.base_url + '/fhem?cmd=' + cmd + '&XHR=1';

    request.get({url: fhem_url}, function(err, response, body) {
      //this.log('body: ' + body);
      if (!err && response.statusCode == 200) {
        var state = body.trim();
        if (state.match(/^[A-D]./))  // EnOcean
          state = state.slice(1,2);
        
        this.log('getPowerState: >' + state + '<');
                
        switch (state) {
          case  '0':
          case  'off':   this.currentValue.On = false; break;
          case  'I':
          case  '1':
          case  'on':    this.currentValue.On = true; break;
          default:      // nothing
        }
        callback(null, this.currentValue.On);
      } 
      else {
        callback(err);
        this.log(err);
        if(response)
          this.log("statusCode: " + response.statusCode + " Message: " + response.statusMessage );
      }
    }.bind(this));
  },
  
  setPowerState: function(boolvalue, callback) {
       
    this.log("setStatePower: " + boolvalue);
    
    if (boolvalue == this.currentValue.On) {
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
    this.log("cmd: " + cmd);
    
    var fhem_url = this.base_url + '/fhem?cmd=' + cmd + '&XHR=1';    
    //this.log(fhem_url);
        
    request({url: fhem_url}, function(err, response, body) {

      if (!err && response.statusCode == 200) {
        this.currentValue.On = boolvalue;
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
  
  /**
  * Characteristic.BlindPosition
  */
  
  getBlindPosition: function(callback) {
  
    var cmd = '{ReadingsVal("' + this.name + '","dim","")}';
    var fhem_url = this.base_url + '/fhem?cmd=' + cmd + '&XHR=1';
    
    request.get({url: fhem_url}, function(err, response, body) {
      
      if (!err && response.statusCode == 200) {
        this.currentValue.BlindPosition = parseInt(body.trim());
        
        if(this.currentValue.BlindPosition == 99) this.currentValue.BlindPosition = 100;  // Fibaro FGRM-222
        if(this.currentValue.BlindPosition == 1) this.currentValue.BlindPosition = 0;     // Fibaro FGRM-222
        
        //this.log('getBlindPosition: >' + body.trim() + '< this.currentValue.BlindPosition: ' + this.currentValue.BlindPosition);
        callback(null, this.currentValue.BlindPosition);
      } 
      else {
        callback(err);
        this.log(err);
        if(response)
          this.log("statusCode: " + response.statusCode + " Message: " + response.statusMessage );
      }
    }.bind(this));
  },
  
  setBlindPosition: function(value, callback) {
    
    if (value == this.currentValue.BlindPosition) {
      callback();
      return;
    }
  
    callback();  // callback immmidiatly to avoid display delay 
    
    if(value == 100) value = 99;  // Fibaro FGRM-222 
    
    if(this.timeoutObj) {
      clearTimeout(this.timeoutObj);
    }
    
    var cmd = 'set ' + this.name + ' dim ' + value;
    //this.log("cmd: " + cmd);
    
    var fhem_url = this.base_url + '/fhem?cmd=' + cmd + '&XHR=1';         
    //this.log(fhem_url);
     
    this.timeoutObj = setTimeout(function() { 
      
      request({url: fhem_url}, function(err, response, body) {

        if (!err && response.statusCode == 200) {
          this.currentValue.BlindPosition = value;
          this.log("cmd: " + cmd);
          // callback();
        } 
        else {
          // callback(err);
          this.log(err);
          if(response)
            this.log("statusCode: " + response.statusCode + " Message: " + response.statusMessage );
        }
      }.bind(this));
    }.bind(this), 1000);
  },
  
  /**
  * Characteristic.SlatPosition  (Horizontal Tilt Angle)
  */
  
  getSlatPosition: function(callback) {
  
    var cmd = '{ReadingsVal("' + this.name + '","positionSlat","")}';
    var fhem_url = this.base_url + '/fhem?cmd=' + cmd + '&XHR=1';
    
    request.get({url: fhem_url}, function(err, response, body) {
      
      if (!err && response.statusCode == 200) {
        this.currentValue.SlatPosition = parseInt(parseInt(body.trim()) / 0.9); // Fibaro FGRM-222
        
        //this.log('getSlatPosition: ' + body.trim() + ' this.currentValue.SlatPosition: ' + this.currentValue.SlatPosition);
        callback(null, this.currentValue.SlatPosition);
      } 
      else {
        callback(err);
        this.log(err);
        if(response)
          this.log("statusCode: " + response.statusCode + " Message: " + response.statusMessage );
      }
    }.bind(this));
  },
  
  setSlatPosition: function(value, callback) {
    
    if (value == this.currentValue.SlatPosition) {
      callback();
      return;
    }
  
    callback();  // callback immmidiatly to avoid display delay 
    
    if(this.timeoutObj) {
      clearTimeout(this.timeoutObj);
    }
    
    value = parseInt(value * 0.9);  // Fibaro FGRM-222 0 .. 100 => 0 .. 90
    
    var cmd = 'set ' + this.name + ' positionSlat ' + value;
    //this.log("cmd: " + cmd);
    
    var fhem_url = this.base_url + '/fhem?cmd=' + cmd + '&XHR=1';         
    //this.log(fhem_url);
     
    this.timeoutObj = setTimeout(function() { 
      
      request({url: fhem_url}, function(err, response, body) {

        if (!err && response.statusCode == 200) {
          this.currentValue.SlatPosition = value;
          this.log("cmd: " + cmd);
          // callback();
        } 
        else {
          // callback(err);
          this.log(err);
          if(response)
            this.log("statusCode: " + response.statusCode + " Message: " + response.statusMessage );
        }
      }.bind(this));
    }.bind(this), 1000);
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
      .setCharacteristic(Characteristic.Manufacturer, "Aeon Labs")
      .setCharacteristic(Characteristic.Model, "Aeotec FGRM-222")
      .setCharacteristic(Characteristic.SerialNumber, "V2/2")
      .setCharacteristic(Characteristic.Name, this.name);
        
    var FhemFibaroRollerShutterService = new Service.Lightbulb();
        
    this.Characteristic.On = FhemFibaroRollerShutterService
      .getCharacteristic(Characteristic.On)
      .on('get', this.getPowerState.bind(this))
      .on('set', this.setPowerState.bind(this));
    this.currentValue.On = false;
 
    // used for the Blind Position
    this.Characteristic.BlindPosition = FhemFibaroRollerShutterService
      .addCharacteristic(Characteristic.Brightness)
      .on('get', this.getBlindPosition.bind(this))
      .on('set', this.setBlindPosition.bind(this));
    this.currentValue.BlindPosition = 0;   // 0 .. 100
    
    if(this.slat) {
      // used for the Slat Position
      this.log("getServices ");
      this.Characteristic.SlatPosition = FhemFibaroRollerShutterService
        .addCharacteristic(Characteristic.Saturation)
        .on('get', this.getSlatPosition.bind(this))
        .on('set', this.setSlatPosition.bind(this));
      this.currentValue.SlatPosition = 0;   // 0 .. 100 (0 .. 90)
    }
    
    return [informationService, FhemFibaroRollerShutterService];
  }
};
