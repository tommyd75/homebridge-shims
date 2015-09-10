// Description: Acceccory Shim to use with homebridge https://github.com/nfarina/homebridge
// Copy this file into the folder: homebridge/accessories

/* config.json Example:
{          
    "bridge": {
        "name": "Homebridge",
        "username": "CC:22:3D:E3:CE:27",
        "port": 51826,
        "pin": "031-45-154"
    },

    "platforms": [],                        
                          
    "accessories": [
        {
            "accessory": "FakeOutlet",
            "name": "fake_accessory"
        },
    ]                      
}
*/

var Service = require("HAP-NodeJS").Service;
var Characteristic = require("HAP-NodeJS").Characteristic;
var request = require("request");

module.exports = {
  accessory: FakeOutlet
}

'use strict';


function FakeOutlet(log, config) {
  this.log = log;
  this.name = config["name"];

  this.Characteristic = {};
  this.currentValue = {};
}

FakeOutlet.prototype = {
      
  /**
  * Characteristic.On
  */
  
  getPowerState: function(callback) {

    
    this.log("getPowerState: " + this.currentValue.On);
    callback(null, this.currentValue.On);
  },
  
  setPowerState: function(boolvalue, callback) {
    
    this.log("setPowerState: " + boolvalue);
    this.currentValue.On = boolvalue;
    callback();
  },
  
  /**
  * Characteristic.OutletInUse
  */

  getOutletInUse: function(callback) {
    
    this.log('getOutletInUse');
    callback(null,this.currentValue.OutletInUse);   // true/false
  },
  
  setOutletInUse: null, // N/A
    
  /**
  * Accessory Information Identify 
  */
  
  identify: function(callback) {
    this.log("Identify requested!");
    callback(); // success
  },
  
  /**
  * Services and Characteristics
  */
  
  getServices: function() {
    
    var informationService = new Service.AccessoryInformation();
    
    informationService
      .setCharacteristic(Characteristic.Manufacturer, "Fake Manufacturer")
      .setCharacteristic(Characteristic.Model, "Fake Model")
      .setCharacteristic(Characteristic.SerialNumber, "Fake Serial Number")
      .setCharacteristic(Characteristic.Name, this.name);
        
    var FakeOutletService = new Service.Outlet();
    
    this.Characteristic.On = FakeOutletService
      .getCharacteristic(Characteristic.On)
      .on('get', this.getPowerState.bind(this))
      .on('set', this.setPowerState.bind(this));
    this.currentValue.On = false;
    
    this.Characteristic.OutletInUse = FakeOutletService
      .getCharacteristic(Characteristic.OutletInUse)
      .on('get', this.getOutletInUse.bind(this));
    this.currentValue.OutletInUse = true;
      
    return [informationService, FakeOutletService];
  }
};
