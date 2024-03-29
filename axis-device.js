//Copyright (c) 2021-2024 Fred Juhlin

const VapixWrapper = require('./vapix-wrapper');
var vapix = require("./vapix-digest.js");

module.exports = function(RED) {
	
    function Axis_Device(config) {
	
		RED.nodes.createNode(this,config);
		this.preset = config.preset;
		this.action = config.action;
		this.cgi = config.cgi;
		this.data = config.data;
		this.options = config.options;
		this.filename = config.filename;
		var node = this;
		node.on('input', function(msg) {
			node.status({});

			var preset = RED.nodes.getNode(node.preset);
			var device = {
				address: msg.address || preset.address,
				user: msg.user || preset.credentials.user,
				password: msg.password || preset.credentials.password,
				protocol: preset.protocol || "http"
			}

			var action = msg.action || node.action;
			var data = node.data || msg.payload;
			var options = msg.options || node.options;
			var filename = msg.filename || node.filename || null;
			
			if( !device.address || device.address.length === 0 || !device.user || device.user.length === 0 || !device.password || device.password.length === 0 ) {
				msg.payload = {
					statusCode: 0,
					statusMessage: "Invalid input",
					body: "Missing device address, user or password"
				}
				msg.payload.action = action;
				msg.payload.address = device.address;
				node.error("Invalid input", msg);
				return;
			}	
			
			switch( action ) {
				case "Device Info":
					var deviceInfo = {
						name: null,
						model: null,
						type: null,
						hostname: null,
						address: device.address,
						IPv4: null,
						IPv6: null,
						mac: null,
						firmware: null,
						camera:true,
						audio:true,
						serial: null,
						platform: null,
						chipset: null,
						hardware: null,
						authenticated: false
						
					}
					vapix.HTTP_Post( device, "/axis-cgi/basicdeviceinfo.cgi", {
							"apiVersion": "1.3",
							"method": "getAllUnrestrictedProperties"
						},"json",
						function( error, response ) {
							//Chaeck and manage if firmware that is too old for beasicdeviceinfo...
							if(error || !response.hasOwnProperty("data") || !response.data.hasOwnProperty("propertyList") || !response.data.propertyList ) {
								VapixWrapper.DeviceInfo( device, function(error, response ) {
									deviceInfo.name = response.name;
									deviceInfo.model = response.model;
									deviceInfo.serial = response.serial;
									deviceInfo.type = response.type;
									deviceInfo.mac = response.mac;
									deviceInfo.IPv4 = response.IPv4;
									deviceInfo.IPv6 = response.IPv6;
									deviceInfo.firmware = response.firmware;
									deviceInfo.hardware = response.hardware;
									deviceInfo.platform = response.platform;
									deviceInfo.chipset = response.chipset;
									deviceInfo.camera = response.camera;
									deviceInfo.audio = response.audio;
									deviceInfo.authenticated = true;
									msg.payload = deviceInfo;
									if( error ) {
										msg.payload.action = action;
										msg.payload.address = device.address;
										node.error(response.statusMessage, msg);
										return;
									}
									msg.payload = deviceInfo;
									node.send(msg);
								});
								return;
							}
							var propertyList = response.data.propertyList;
							deviceInfo.name = propertyList.ProdShortName;
							deviceInfo.model = propertyList.ProdNbr;
							deviceInfo.serial = propertyList.SerialNumber;
							deviceInfo.type = propertyList.ProdType;
							deviceInfo.mac = propertyList.SerialNumber.slice(0,2) + ":";
							deviceInfo.mac += propertyList.SerialNumber.slice(2, 4) + ":";
							deviceInfo.mac += propertyList.SerialNumber.slice(4, 6) + ":";
							deviceInfo.mac += propertyList.SerialNumber.slice(6, 8) + ":";
							deviceInfo.mac += propertyList.SerialNumber.slice(8, 10) + ":";
							deviceInfo.mac += propertyList.SerialNumber.slice(10, 12);
							deviceInfo.address = device.address;
							deviceInfo.firmware = propertyList.Version;
							deviceInfo.hardware = propertyList.HardwareID;

							VapixWrapper.Param_Get( device, "properties", function( error, response ) {
								if( error ) {
									msg.payload = deviceInfo;
									node.send(msg);
									return;
								}
								deviceInfo.authenticated = true;
								deviceInfo.camera = response.Image && response.Image.Format ? true: false;
								deviceInfo.audio = response.Audio && response.Audio.Audio ? true: false;
								deviceInfo.platform = response.System && response.System.Architecture ? response.System.Architecture:"";
								if( response.System && response.System.hasOwnProperty("Soc") ) {
									var items = response.System.Soc.split(' ');
									if( items.length > 1 )
										deviceInfo.chipset = items[1];
									else
										deviceInfo.chipset = response.System.Soc;
								}
								VapixWrapper.Param_Get( device, "network", function( error, response ) {
									if( error ) {
										msg.payload = deviceInfo;
										node.send(msg);
										return;
									}
									deviceInfo.hostname = response.HostName || "";
									deviceInfo.hostname = response.VolatileHostName.HostName || deviceInfo.hostname;
									if( response.hasOwnProperty("eth0") && response.eth0.hasOwnProperty("IPv6") ) {
										deviceInfo.IPv4 = response.eth0.IPAddress || null;
										deviceInfo.IPv6 = response.eth0.IPv6.IPAddresses || null;
									}
									msg.payload = deviceInfo;
									node.send(msg);
								});
							});
						}
					);
				break;

				case "Get Network settings":
					var request = {
						"apiVersion": "1.0",
						"context": "nodered",
						"method": "getNetworkInfo",
						"params":{}
					}
					VapixWrapper.CGI_Post( device, "/axis-cgi/network_settings.cgi", request, function(error, response ) {
						msg.payload = response;
						if( error ) {
							msg.payload.action = action;
							msg.payload.address = device.address;
							node.error(action + " failed", msg);
							return;
						}
						if( msg.payload.hasOwnProperty("error") || !msg.payload.hasOwnProperty("data") ) {
							msg.payload = {
								statusCode: 200,
								statusMessage: "Invalid response",
								body: msg.payload
							}
							msg.payload.action = action;
							msg.payload.address = device.address;
							node.error(response.statusMessage, msg);
							return;
						}
						msg.payload = msg.payload.data;
						node.send(msg);
					});
				break;
				
				case "Restart":
					VapixWrapper.CGI( device, '/axis-cgi/restart.cgi', function(error, response) {
						msg.payload = response;
						if( error ) {
							msg.payload.action = action;
							msg.payload.address = device.address;
							node.error(response.statusMessage, msg);
							return;
						}
						msg.payload = device.address + " restarting";
						node.send(msg);
					});
				break;

				case "Upgrade firmware":
					node.status({fill:"blue",shape:"dot",text:"Updating..."});
					var fileData = msg.payload;
					if( filename && filename.length > 5)
						fileData = filename;
					VapixWrapper.Upload_Firmare( device , fileData, function(error, response ) {
						msg.payload = response;
						if(error) {
							node.status({fill:"red",shape:"dot",text:"Error"});
							msg.payload = response;
							msg.payload.action = action;
							msg.payload.address = device.address;
							node.error(response.statusMessage, msg);
							return;
						}
						node.status({fill:"green",shape:"dot",text:"Success"});
						node.send(msg);
					});
				break;

				case "Set time":
					if( typeof data === "string" )
						data = JSON.parse(data);
					if(!data) {
						msg.payload = {
							statusCode: 400,
							statusMessage: "Invalid input",
							body: "Time data needs to be an objet or JSON"
						}
						msg.payload.action = action;
						msg.payload.address = device.address;
						node.error(response.statusMessage, msg);
						return;
					}
					var numberOfSetttings = 0;
					for( var name in data ) {
						if(name === "ntp")
							numberOfSetttings++;
						if(name === "timezone")
							numberOfSetttings++;
					}
					if( numberOfSetttings === 0 ) {
						msg.payload = data;
						node.send(msg);
						return;
					}
					if( data.hasOwnProperty("ntp") ) {
						if(typeof data.ntp === "string" )
							data.ntp = [data.ntp];
						if( !Array.isArray(data.ntp) ) {
							VapixWrapper.CGI( device, "/axis-cgi/param.cgi?action=update&Time.ObtainFromDHCP=yes", function(error, response ){
								msg.payload = response;
								if( error ) {
									msg.payload.action = action;
									msg.payload.address = device.address;
									node.error(response.statusMessage, msg);
									return;
								}
								numberOfSetttings--;
								if( numberOfSetttings <= 0 ) {
									msg.payload = data;
									node.send(msg);
									return;
								}
							});
						} else {
							var body = {
								"apiVersion":"1.1",
								"method":"setNTPClientConfiguration",
								"params":{
									"enabled":true,
									"serversSource":"static",
									"staticServers":data.ntp
								}
							}
							VapixWrapper.CGI_Post( device, "/axis-cgi/ntp.cgi", body, function(error, response) {
								msg.payload = response;
								if( error ) {
									msg.payload.action = action;
									msg.payload.address = device.address;
									node.error(response.statusMessage, msg);
									return;
								}
								VapixWrapper.CGI( device, "/axis-cgi/param.cgi?action=update&Time.ObtainFromDHCP=no", function(error, response ){
									msg.payload = response;
									if( error ) {
										msg.payload.action = action;
										msg.payload.address = device.address;
										node.error(response.statusMessage, msg);
										return;
									}
									numberOfSetttings--;
									if( numberOfSetttings <= 0 ) {
										if(!error)
											msg.payload = data;
										node.send(msg);
										return;
									}
								})
							});
						}
					}
					if( data.hasOwnProperty("timezone") ) {
						if( typeof data.timezone !== "string" || data.timezone.length < 8 ||  data.timezone.search("/") < 0 ) {
							numberOfSetttings--;
							if( numberOfSetttings <= 0 ) {
								msg.payload = {
									statusCode: 400,
									statusMessage: "Invalid input",
									body: "Timezon syntax"
								}
								msg.payload.action = action;
								msg.payload.address = device.address;
								node.error(response.statusMessage, msg);
								return;
							}
						} else {
							var body = {
								"apiVersion":"1.0",
								"method":"setTimeZone",
								"params":{
									"timeZone": data.timezone
								}
							}
							VapixWrapper.CGI_Post( device, "/axis-cgi/time.cgi", body, function(error, response) {
								msg.payload = response;
								if( error ) {
									msg.payload.action = action;
									msg.payload.address = device.address;
									node.error(response.statusMessage, msg);
									return;
								}
								msg.payload = data;
								numberOfSetttings--;
								if( numberOfSetttings <= 0 ) {
									msg.payload = data;
									node.send(msg);
								}
							});
						}
					}
				break;
				
				case "Set name":
					var name = msg.payload;
					name = name.replace(/\s/g , "-");
					if( typeof name !== "string" || name.length < 3 ) {
						msg.payload = {
							statusCode: 0,
							statusMessage: "Invalid input",
							body: "Name needs to be a string"
						}
						msg.payload.action = action;
						msg.payload.address = device.address;
						node.error(response.statusMessage, msg);
					}
						
					var cgi = "/axis-cgi/param.cgi?action=update";
					cgi += "&root.Network.VolatileHostName.ObtainFromDHCP=no";
					cgi += "&root.Network.HostName=" + name;
					cgi += "&root.Network.Bonjour.FriendlyName=" + name;
					cgi += "&root.Network.UPnP.FriendlyName=" + name;
					VapixWrapper.CGI( device, cgi, function(error, response) {
						msg.payload = response;
						if( error ) {
							msg.payload.action = action;
							msg.payload.address = device.address;
							node.error(response.statusMessage, msg);
							return;
						}
						msg.payload = name;
						node.send(msg);
					});
					break;

				case "Syslog":
					VapixWrapper.Syslog( device, function( error, response) {
						msg.payload = response;
						if( error ) {
							msg.payload.action = action;
							msg.payload.address = device.address;
							node.error(response.statusMessage, msg);
							return;
						}
						node.send(msg);
					});
				break;

				case "Connections":
					VapixWrapper.Connections( device, function( error, response) {
						msg.payload = response;
						if( error ) {
							msg.payload.action = action;
							msg.payload.address = device.address;
							node.error(response.statusMessage, msg);
							return;
						}
						node.send(msg);
					});
				break;

				case "Get location":
					VapixWrapper.Location_Get( device, function( error, response) {
						msg.payload = response;
						if( error ) {
							msg.payload.action = action;
							msg.payload.address = device.address;
							node.error(response.statusMessage, msg);
							return;
						}
						node.send(msg);
					});
				break;

				case "Set location":
					if( typeof data === "string" )
						data = JSON.parse( data );
					
					if(!data || typeof data !== "object") {
						msg.payload = {
							statusCode: 400,
							statusMessage: "Invalid input",
							body: "Location syntax error"
						}
						msg.payload.action = action;
						msg.payload.address = device.address;
						node.error(response.statusMessage, msg);
						return;
					}
					VapixWrapper.Location_Set( device, data, function( error, response) {
						msg.payload = response;
						if( error ) {
							msg.payload.action = action;
							msg.payload.address = device.address;
							node.error(response.statusMessage, msg);
							return;
						}
						msg.payload = data;
						node.send(msg);
					});
				break;

				case "HTTP Get":
					var cgi = node.cgi || msg.cgi;
					if( !cgi || cgi.length < 2 ) {
						msg.payload = {
							statusCode: 400,
							statusMessage: "Invalid input",
							body: "Missing cgi"
						}
						msg.payload.action = action;
						msg.payload.address = device.address;
						node.error(response.statusMessage, msg);
						return;
					}
					VapixWrapper.HTTP_Get( device, cgi, "text", function(error, response ) {
						msg.payload = response;
						if( error ) {
							msg.payload.action = action;
							msg.payload.address = device.address;
							node.error(response.statusMessage, msg);
							return;
						}
						node.send(msg);
					});
				break;
				
				case "HTTP Put":
					var data = node.data || msg.payload;
					var cgi = node.cgi || msg.cgi;
					if( !cgi || cgi.length < 2 ) {
						msg.payload = {
							statusCode: 400,
							statusMessage: "Invalid input",
							body: "Missing cgi"
						}
						msg.payload.action = action;
						msg.payload.address = device.address;
						node.error(response.statusMessage, msg);
						return;
					}
					if(!data) {
						msg.payload = {
							statusCode: 400,
							statusMessage: "Invalid input",
							body: "Missing post data"
						}
						msg.payload.action = action;
						msg.payload.address = device.address;
						node.error(response.statusMessage, msg);
						return;
					}
					node.status({fill:"blue",shape:"dot",text:"Requesting..."});
					
					VapixWrapper.HTTP_Put( device, cgi, data, "text", function(error, response ) {
						msg.payload = response;
						if( error ) {
							node.status({fill:"red",shape:"dot",text:"Request failed"});
							msg.payload.action = action;
							msg.payload.address = device.address;
							node.error(response.statusMessage, msg);
							return;
						}

						node.status({fill:"green",shape:"dot",text:"Request success"});
						node.send(msg);
					});
				break;

				case "HTTP Post":
					var data = node.data || msg.payload;
					var cgi = node.cgi || msg.cgi;
					if( !cgi || cgi.length < 2 ) {
						msg.payload = {
							statusCode: 400,
							statusMessage: "Invalid input",
							body: "Missing cgi"
						}
						msg.payload.action = action;
						msg.payload.address = device.address;
						node.error(response.statusMessage, msg);
						return;
					}
					if(!data) {
						msg.payload = {
							statusCode: 400,
							statusMessage: "Invalid input",
							body: "Missing post data"
						}
						msg.payload.action = action;
						msg.payload.address = device.address;
						node.error(response.statusMessage, msg);
						return;
					}
					node.status({fill:"blue",shape:"dot",text:"Requesting..."});
					
					VapixWrapper.HTTP_Post( device, cgi, data, "text", function(error, response ) {
						msg.payload = response;
						if( error ) {
							node.status({fill:"red",shape:"dot",text:"Request failed"});
							msg.payload.action = action;
							msg.payload.address = device.address;
							node.error(response.statusMessage, msg);
							return;
						}

						node.status({fill:"green",shape:"dot",text:"Request success"});
						node.send(msg);
					});
				break;

				case "HTTP Patch":
					var data = node.data || msg.payload;
					var cgi = node.cgi || msg.cgi;
					if( !cgi || cgi.length < 2 ) {
						msg.payload = {
							statusCode: 400,
							statusMessage: "Invalid input",
							body: "Missing cgi"
						}
						msg.payload.action = action;
						msg.payload.address = device.address;
						node.error(response.statusMessage, msg);
						return;
					}
					if(!data) {
						msg.payload = {
							statusCode: 400,
							statusMessage: "Invalid input",
							body: "Missing post data"
						}
						msg.payload.action = action;
						msg.payload.address = device.address;
						node.error(response.statusMessage, msg);
						return;
					}
					node.status({fill:"blue",shape:"dot",text:"Requesting..."});
					
					VapixWrapper.HTTP_Patch( device, cgi, data, "text", function(error, response ) {
						msg.payload = response;
						if( error ) {
							node.status({fill:"red",shape:"dot",text:"Request failed"});
							msg.payload.action = action;
							msg.payload.address = device.address;
							node.error(response.statusMessage, msg);
							return;
						}

						node.status({fill:"green",shape:"dot",text:"Request success"});
						node.send(msg);
					});
				break;

				case "SOAP Post":
					if( typeof data !== "string" || data.length < 20 || data[0] !== '<') {
						msg.payload = {
							statusCode: 400,
							statusMessage: "Invalid input",
							body: "SOAP body syntax"
						}
						msg.payload.action = action;
						msg.payload.address = device.address;
						node.error(response.statusMessage, msg);
						return;
					}
					VapixWrapper.SOAP( device, data, function(error, response ) {
						if( error ) {
							msg.payload = response;
							msg.payload.action = action;
							msg.payload.address = device.address;
							node.error(response.statusMessage, msg);
							return;
						}
						msg.payload = response;
						node.send(msg);
					});
				break;
				
				default:
					msg.payload = {
						statusCode: 400,
						statusMessage: "Invalid input",
						body: action + "is undefined",
					}
					msg.payload.action = action;
					msg.payload.address = device.address;
					node.error(response.statusMessage, msg);
					return;
			}
        });
    }
	
    RED.nodes.registerType("Axis device",Axis_Device,{
		defaults: {
			name: { type:"text" },
			preset: {type:"Device Access"},
			action: { type:"text" },
			data: {type: "text"},
			options: {type: "text"},
			cgi: {type: "text"},
			filename: { type:"text" }
		}		
	});
}

