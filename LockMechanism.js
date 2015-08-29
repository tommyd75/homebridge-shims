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
            "accessory": "LockMechanism",
            "name": "LockMechanism"
        }
    ]                      
}
*/

var Service = require("HAP-NodeJS").Service;
var Characteristic = require("HAP-NodeJS").Characteristic;
var request = require("request");

module.exports = {
  accessory: LockMechanism
}

function LockMechanism(log, config) {
  this.log = log;
  this.name = config["name"];
  
  this.Characteristic = {};
  this.currentValue = {};
}

LockMechanism.prototype = {

  /**
  * Lock Simulation
  */
  
  setLockCurrentState: function(value) {
  
    if(this.timeoutObj) {
      clearTimeout(this.timeoutObj);
    }
    
    this.timeoutObj = setTimeout(function() {
      // 0: Unlocked (unsecured), 1: Locked (secured), 2: Jammed, 3: unknown
      // Simulation: after 2 seconds this.currentValue.LockCurrentState is set to this.currentValue.LockTargetState
      switch (value) {
        case 'unlock':  this.currentValue.LockCurrentState = 0; break;
        case 'lock':    this.currentValue.LockCurrentState = 1; break;
        default:
      }
      this.Characteristic.LockCurrentState.setValue(this.currentValue.LockCurrentState);
    }.bind(this), 1500);
  },
  
  /**
  * Characteristic.LockCurrentState
  */
  
  getLockCurrentState: function(callback) {
  
    this.log('getLockCurrentState');
    
    // comment callback and uncomment your code
    callback(null, this.currentValue.LockTargetState);
    
    
    /* your code
    request('http://192.168.0.100/jsonapi.asp?action=getdevice&id=Z2', function (error, resp, body) {
      if (!error) {
        var response = JSON.parse(body);
        var value = response['value'];
        callback(null,value);
      }
      else {
        callback(error);
      }
    });
    */ // your code end
  },
  
  /**
  * Characteristic.LockTargetState
  */

  getLockTargetState: function(callback) {
  
    this.log('getLockTargetState');
    callback(null, this.currentValue.LockTargetState);
    
    /* your code    
    request('http://192.168.0.100/jsonapi.asp?action=getdevice&id=L70', function (error, resp, body) {
      if (!error) {
      var response = JSON.parse(body);
      var value = response['value'];
      callback(null,value);
      }
      else {
      callback(error);
      }
    });
    */ // your code end
  },
  
  
  setLockTargetState: function(lock, callback) {

    this.log('setLockTargetState: ' + lock);
    this.currentValue.LockTargetState = lock;
    
    switch (lock) {
      case 0:
      case false:  target = 'unlock'; break;
      case 1:
      case true:   target = 'lock';  break; 
      default:  
    }
    
    // comment setLockCurrentState and callback and uncomment your code
    this.setLockCurrentState(target);
    callback();
    
    
    /* your code
    this.log( "Rear door set to: " + target );
    request("http://192.168.0.100/tenHsServer/tenHsServer.aspx?t=ab&f=RunEvent&d="+target);
    callback();
    */ // your code end
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
      .setCharacteristic(Characteristic.Manufacturer, "LM Manufacturer")
      .setCharacteristic(Characteristic.Model, "LM Model")
      .setCharacteristic(Characteristic.SerialNumber, "LM Serial Number")
      .setCharacteristic(Characteristic.Name, this.name);
        
    var LockMechanismService = new Service.LockMechanism();
    
    this.Characteristic.LockCurrentState = LockMechanismService
      .getCharacteristic(Characteristic.LockCurrentState)
      .on('get', this.getLockCurrentState.bind(this));

    this.Characteristic.LockTargetState = LockMechanismService
      .getCharacteristic(Characteristic.LockTargetState)
      .on('get', this.getLockTargetState.bind(this))
      .on('set', this.setLockTargetState.bind(this));
      
    this.currentValue.LockTargetState = false;
      
    return [informationService, LockMechanismService];
  }
};
