import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import path from 'path';
import { exec } from 'child_process';
import os from 'os';
import 'dotenv/config';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// In-memory storage fallback
let inMemoryCommands = [];
let mongoConnected = false;
let dbInitialized = false;

// MongoDB Connection with fallback
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/voice-control-app';

// Try to connect to MongoDB with timeout
const connectToMongoDB = async () => {
    try {
        await mongoose.connect(MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            serverSelectionTimeoutMS: 5000, // 5 second timeout
            connectTimeoutMS: 5000
        });
        console.log('✅ Connected to MongoDB');
        mongoConnected = true;
        return true;
    } catch (err) {
        console.log('⚠️  MongoDB not available, using in-memory storage');
        console.log('💡 To use persistent storage, ensure MongoDB is running on localhost:27017');
        mongoConnected = false;
        return false;
    }
};

// Initialize MongoDB connection
connectToMongoDB().then(() => {
    dbInitialized = true;
}).catch(() => {
    dbInitialized = true; // Still mark as initialized even if MongoDB failed
});

// Graceful fallback for MongoDB operations
mongoose.connection.on('error', () => {
    mongoConnected = false;
    console.log('⚠️  MongoDB connection lost, switching to in-memory storage');
});

mongoose.connection.on('connected', () => {
    mongoConnected = true;
    console.log('✅ MongoDB reconnected');
});

// Command Schema
const commandSchema = new mongoose.Schema({
    text: { type: String, required: true },
    type: { type: String, enum: ['voice', 'text'], required: true },
    timestamp: { type: Date, default: Date.now },
    status: { type: String, enum: ['success', 'error'], required: true },
    response: { type: String, required: true },
    platform: { type: String, default: os.platform() },
    userAgent: String
});

const Command = mongoose.model('Command', commandSchema);

// Helper functions for data storage
const saveCommand = async (commandData) => {
    // Wait for database initialization if not ready
    if (!dbInitialized) {
        await new Promise(resolve => {
            const checkInit = () => {
                if (dbInitialized) {
                    resolve();
                } else {
                    setTimeout(checkInit, 100);
                }
            };
            checkInit();
        });
    }
    
    if (mongoConnected) {
        try {
            const command = new Command(commandData);
            await command.save();
            return command;
        } catch (error) {
            console.log('MongoDB save failed, using in-memory storage');
            mongoConnected = false;
        }
    }
    
    // Fallback to in-memory storage
    const command = {
        _id: Date.now().toString(),
        ...commandData,
        timestamp: new Date()
    };
    inMemoryCommands.unshift(command);
    
    // Keep only last 100 commands in memory
    if (inMemoryCommands.length > 100) {
        inMemoryCommands = inMemoryCommands.slice(0, 100);
    }
    
    return command;
};

const getCommands = async (limit = 50) => {
    // Wait for database initialization if not ready
    if (!dbInitialized) {
        await new Promise(resolve => {
            const checkInit = () => {
                if (dbInitialized) {
                    resolve();
                } else {
                    setTimeout(checkInit, 100);
                }
            };
            checkInit();
        });
    }
    
    if (mongoConnected) {
        try {
            return await Command.find()
                .sort({ timestamp: -1 })
                .limit(limit)
                .select('-userAgent -__v');
        } catch (error) {
            console.log('MongoDB fetch failed, using in-memory storage');
            mongoConnected = false;
        }
    }
    
    // Fallback to in-memory storage
    return inMemoryCommands.slice(0, limit);
};

const clearCommands = async () => {
    // Wait for database initialization if not ready
    if (!dbInitialized) {
        await new Promise(resolve => {
            const checkInit = () => {
                if (dbInitialized) {
                    resolve();
                } else {
                    setTimeout(checkInit, 100);
                }
            };
            checkInit();
        });
    }
    
    if (mongoConnected) {
        try {
            await Command.deleteMany({});
            return;
        } catch (error) {
            console.log('MongoDB clear failed, using in-memory storage');
            mongoConnected = false;
        }
    }
    
    // Fallback to in-memory storage
    inMemoryCommands = [];
};

// Command Processing Functions
class CommandProcessor {
    static async processCommand(commandText, userAgent = '') {
        const cmd = commandText.toLowerCase().trim();
        let response = '';
        let status = 'success';

        try {
            // Web-based commands (work on all platforms)
            if (cmd.includes('open') && (cmd.includes('.com') || cmd.includes('.org') || cmd.includes('.net') || cmd.includes('.io'))) {
                const urlMatch = cmd.match(/open\s+([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
                if (urlMatch) {
                    const url = urlMatch[1];
                    await this.openWebsite(url);
                    response = `✅ Opening ${url}`;
                }
            }
            
            // Search commands
            else if (cmd.includes('search') || cmd.includes('google')) {
                const searchTerm = cmd.replace(/search|google/g, '').trim();
                if (searchTerm) {
                    await this.openWebsite(`google.com/search?q=${encodeURIComponent(searchTerm)}`);
                    response = `✅ Searching Google for: ${searchTerm}`;
                }
            }
            
            // YouTube search
            else if (cmd.includes('youtube')) {
                const searchTerm = cmd.replace(/youtube|search|on/g, '').trim();
                if (searchTerm) {
                    await this.openWebsite(`youtube.com/results?search_query=${encodeURIComponent(searchTerm)}`);
                    response = `✅ Searching YouTube for: ${searchTerm}`;
                } else {
                    await this.openWebsite('youtube.com');
                    response = `✅ Opening YouTube`;
                }
            }
            
            // Time and date
            else if (cmd.includes('time') || cmd.includes('what time')) {
                const now = new Date();
                response = `🕐 Current time: ${now.toLocaleTimeString()}`;
            }
            
            else if (cmd.includes('date') || cmd.includes('what date')) {
                const now = new Date();
                response = `📅 Current date: ${now.toLocaleDateString()}`;
            }
            
            // Weather
            else if (cmd.includes('weather')) {
                await this.openWebsite('weather.com');
                response = `🌤️ Opening weather information`;
            }
            
            // System-specific commands
            else if (cmd.includes('calculator') || cmd.includes('calc')) {
                await this.openApplication('calculator');
                response = `🧮 Opening calculator`;
            }
            
            else if (cmd.includes('notepad') || cmd.includes('text editor')) {
                await this.openApplication('notepad');
                response = `📝 Opening text editor`;
            }
            
            // WhatsApp commands
            else if (cmd.includes('whatsapp') || cmd.includes('open whatsapp')) {
                if (cmd.includes('call') && (cmd.includes('mom') || cmd.includes('dad') || cmd.includes('friend'))) {
                    const contact = cmd.includes('mom') ? 'Mom' : cmd.includes('dad') ? 'Dad' : 'Friend';
                    await this.openWhatsAppCall(contact);
                    response = `📞 Calling ${contact} on WhatsApp`;
                } else if (cmd.includes('message') || cmd.includes('text')) {
                    const contactMatch = cmd.match(/(?:message|text)\s+(\w+)/);
                    const contact = contactMatch ? contactMatch[1] : 'contact';
                    await this.openWhatsAppMessage(contact);
                    response = `💬 Opening WhatsApp chat with ${contact}`;
                } else {
                    await this.openApplication('whatsapp');
                    response = `💬 Opening WhatsApp`;
                }
            }
            
            // File manager commands
            else if (cmd.includes('file manager') || cmd.includes('explorer') || cmd.includes('files')) {
                if (cmd.includes('downloads')) {
                    await this.openFileLocation('downloads');
                    response = `📁 Opening Downloads folder`;
                } else if (cmd.includes('documents')) {
                    await this.openFileLocation('documents');
                    response = `📁 Opening Documents folder`;
                } else if (cmd.includes('desktop')) {
                    await this.openFileLocation('desktop');
                    response = `📁 Opening Desktop folder`;
                } else {
                    await this.openApplication('filemanager');
                    response = `📁 Opening File Manager`;
                }
            }
            
            // Settings commands
            else if (cmd.includes('settings') || cmd.includes('control panel')) {
                if (cmd.includes('wifi') || cmd.includes('network')) {
                    await this.openSettings('network');
                    response = `⚙️ Opening Network Settings`;
                } else if (cmd.includes('display') || cmd.includes('screen')) {
                    await this.openSettings('display');
                    response = `⚙️ Opening Display Settings`;
                } else if (cmd.includes('sound') || cmd.includes('audio')) {
                    await this.openSettings('sound');
                    response = `⚙️ Opening Sound Settings`;
                } else if (cmd.includes('bluetooth')) {
                    await this.openSettings('bluetooth');
                    response = `⚙️ Opening Bluetooth Settings`;
                } else {
                    await this.openSettings('main');
                    response = `⚙️ Opening System Settings`;
                }
            }
            
            // Application launching commands
            else if (cmd.includes('open') || cmd.includes('launch') || cmd.includes('start')) {
                const appMatch = cmd.match(/(?:open|launch|start)\s+(.+)/);
                if (appMatch) {
                    const appName = appMatch[1].trim();
                    await this.openSpecificApplication(appName);
                    response = `🚀 Opening ${appName}`;
                }
            }
            
            // System control commands (require elevated permissions)
            else if (cmd.includes('shutdown')) {
                const timeMatch = cmd.match(/(\d+)\s*(seconds?|minutes?)/);
                let seconds = 60; // default 1 minute
                
                if (timeMatch) {
                    const value = parseInt(timeMatch[1]);
                    const unit = timeMatch[2];
                    seconds = unit.startsWith('minute') ? value * 60 : value;
                }
                
                await this.systemShutdown(seconds);
                response = `⚠️ System will shutdown in ${seconds} seconds`;
            }
            
            else if (cmd.includes('restart') || cmd.includes('reboot')) {
                await this.systemRestart();
                response = `🔄 System restart initiated`;
            }
            
            else if (cmd.includes('sleep') || cmd.includes('hibernate')) {
                await this.systemSleep();
                response = `😴 System going to sleep`;
            }
            
            // Volume control
            else if (cmd.includes('volume up') || cmd.includes('increase volume')) {
                await this.adjustVolume('up');
                response = `🔊 Volume increased`;
            }
            
            else if (cmd.includes('volume down') || cmd.includes('decrease volume')) {
                await this.adjustVolume('down');
                response = `🔉 Volume decreased`;
            }
            
            else if (cmd.includes('mute') || cmd.includes('volume off')) {
                await this.adjustVolume('mute');
                response = `🔇 Volume muted`;
            }
            
            // System information commands
            else if (cmd.includes('system info') || cmd.includes('system information') || cmd.includes('computer specs')) {
                const systemInfo = await this.getSystemInfo();
                response = systemInfo;
            }
            
            else if (cmd.includes('ram') || cmd.includes('memory')) {
                const memoryInfo = await this.getMemoryInfo();
                response = memoryInfo;
            }
            
            else if (cmd.includes('storage') || cmd.includes('disk space') || cmd.includes('hard drive')) {
                const storageInfo = await this.getStorageInfo();
                response = storageInfo;
            }
            
            else if (cmd.includes('cpu') || cmd.includes('processor')) {
                const cpuInfo = await this.getCPUInfo();
                response = cpuInfo;
            }
            
            else if (cmd.includes('network') || cmd.includes('ip address') || cmd.includes('wifi')) {
                const networkInfo = await this.getNetworkInfo();
                response = networkInfo;
            }
            
            else if (cmd.includes('battery') && (cmd.includes('laptop') || cmd.includes('computer'))) {
                const batteryInfo = await this.getBatteryInfo();
                response = batteryInfo;
            }
            
            else if (cmd.includes('temperature') && (cmd.includes('cpu') || cmd.includes('system'))) {
                const tempInfo = await this.getTemperatureInfo();
                response = tempInfo;
            }
            
            // Default case
            else {
                status = 'error';
                response = `❌ Command not recognized. Try: "open google.com", "search weather", "open calculator", or "what time is it"`;
            }
            
        } catch (error) {
            console.error('Command execution error:', error);
            status = 'error';
            
            // Enhanced error handling for specific error types
            if (error.code === 127) {
                response = `❌ Application not found or not installed. Please ensure the requested application is installed and accessible.`;
            } else if (error.message.includes('ENOENT')) {
                response = `❌ Command not available on this system. This feature may require additional software installation.`;
            } else if (error.message.includes('permission')) {
                response = `❌ Permission denied. This command may require administrator privileges.`;
            } else {
                response = `❌ Error executing command: ${error.message}`;
            }
        }

        return { status, response };
    }

    static async getSystemInfo() {
        const platform = os.platform();
        const arch = os.arch();
        const hostname = os.hostname();
        const uptime = Math.floor(os.uptime() / 3600); // hours
        const totalMem = (os.totalmem() / (1024 ** 3)).toFixed(2); // GB
        const freeMem = (os.freemem() / (1024 ** 3)).toFixed(2); // GB
        const usedMem = (totalMem - freeMem).toFixed(2);
        
        let osInfo = '';
        try {
            if (platform === 'win32') {
                osInfo = await this.executeCommand('wmic os get Caption,Version /format:list');
            } else if (platform === 'darwin') {
                osInfo = await this.executeCommand('sw_vers');
            } else {
                osInfo = await this.executeCommand('lsb_release -a 2>/dev/null || cat /etc/os-release');
            }
        } catch (e) {
            osInfo = `${platform} ${arch}`;
        }
        
        return `💻 System Information:
🖥️ Hostname: ${hostname}
⚙️ Platform: ${platform} (${arch})
🕐 Uptime: ${uptime} hours
🧠 Memory: ${usedMem}GB used / ${totalMem}GB total (${freeMem}GB free)
📋 OS Details: ${osInfo.substring(0, 200)}`;
    }
    
    static async getMemoryInfo() {
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMem = totalMem - freeMem;
        
        const totalGB = (totalMem / (1024 ** 3)).toFixed(2);
        const usedGB = (usedMem / (1024 ** 3)).toFixed(2);
        const freeGB = (freeMem / (1024 ** 3)).toFixed(2);
        const usagePercent = ((usedMem / totalMem) * 100).toFixed(1);
        
        let detailedInfo = '';
        try {
            const platform = os.platform();
            if (platform === 'win32') {
                detailedInfo = await this.executeCommand('wmic memorychip get Capacity,Speed,Manufacturer /format:list');
            } else if (platform === 'darwin') {
                detailedInfo = await this.executeCommand('system_profiler SPMemoryDataType');
            } else {
                detailedInfo = await this.executeCommand('sudo dmidecode --type memory 2>/dev/null | grep -E "Size|Speed|Type:" || free -h');
            }
        } catch (e) {
            detailedInfo = 'Detailed memory info not available';
        }
        
        return `🧠 Memory Information:
📊 Total RAM: ${totalGB} GB
✅ Used: ${usedGB} GB (${usagePercent}%)
🆓 Free: ${freeGB} GB
📋 Details: ${detailedInfo.substring(0, 300)}`;
    }
    
    static async getStorageInfo() {
        const platform = os.platform();
        let storageInfo = '';
        
        try {
            if (platform === 'win32') {
                storageInfo = await this.executeCommand('wmic logicaldisk get Size,FreeSpace,Caption /format:list');
            } else if (platform === 'darwin') {
                storageInfo = await this.executeCommand('df -h / && diskutil list');
            } else {
                storageInfo = await this.executeCommand('df -h --total && lsblk');
            }
        } catch (error) {
            storageInfo = 'Storage information not available';
        }
        
        return `💾 Storage Information:
${storageInfo}`;
    }
    
    static async getCPUInfo() {
        const cpus = os.cpus();
        const cpuModel = cpus[0].model;
        const cpuCores = cpus.length;
        const cpuSpeed = cpus[0].speed;
        
        let detailedInfo = '';
        try {
            const platform = os.platform();
            if (platform === 'win32') {
                detailedInfo = await this.executeCommand('wmic cpu get Name,NumberOfCores,NumberOfLogicalProcessors,MaxClockSpeed /format:list');
            } else if (platform === 'darwin') {
                detailedInfo = await this.executeCommand('sysctl -n machdep.cpu.brand_string && sysctl -n hw.ncpu');
            } else {
                detailedInfo = await this.executeCommand('lscpu');
            }
        } catch (e) {
            detailedInfo = 'Detailed CPU info not available';
        }
        
        return `⚡ CPU Information:
🔧 Model: ${cpuModel}
🔢 Cores: ${cpuCores}
⚡ Speed: ${cpuSpeed} MHz
📋 Details: ${detailedInfo.substring(0, 400)}`;
    }
    
    static async getNetworkInfo() {
        const networkInterfaces = os.networkInterfaces();
        let networkInfo = '🌐 Network Information:\n';
        
        for (const [name, interfaces] of Object.entries(networkInterfaces)) {
            if (interfaces) {
                for (const iface of interfaces) {
                    if (!iface.internal) {
                        networkInfo += `📡 ${name}: ${iface.address} (${iface.family})\n`;
                    }
                }
            }
        }
        
        try {
            const platform = os.platform();
            let additionalInfo = '';
            if (platform === 'win32') {
                additionalInfo = await this.executeCommand('ipconfig /all');
            } else {
                additionalInfo = await this.executeCommand('ifconfig || ip addr show');
            }
            networkInfo += `\n📋 Details: ${additionalInfo.substring(0, 300)}`;
        } catch (e) {
            networkInfo += '\n📋 Additional network details not available';
        }
        
        return networkInfo;
    }
    
    static async getBatteryInfo() {
        const platform = os.platform();
        let batteryInfo = '';
        
        try {
            if (platform === 'win32') {
                batteryInfo = await this.executeCommand('wmic path Win32_Battery get EstimatedChargeRemaining,BatteryStatus /format:list');
            } else if (platform === 'darwin') {
                batteryInfo = await this.executeCommand('pmset -g batt');
            } else {
                batteryInfo = await this.executeCommand('upower -i /org/freedesktop/UPower/devices/battery_BAT0 2>/dev/null || cat /sys/class/power_supply/BAT*/capacity 2>/dev/null');
            }
            
            if (batteryInfo.trim()) {
                return `🔋 Battery Information:
${batteryInfo}`;
            } else {
                return '🔋 Battery: Not available (Desktop computer or battery info inaccessible)';
            }
        } catch (error) {
            return '🔋 Battery: Information not available';
        }
    }
    
    static async getTemperatureInfo() {
        const platform = os.platform();
        let tempInfo = '';
        
        try {
            if (platform === 'win32') {
                tempInfo = await this.executeCommand('wmic /namespace:\\\\root\\wmi PATH MSAcpi_ThermalZoneTemperature get CurrentTemperature /format:list');
            } else if (platform === 'darwin') {
                tempInfo = await this.executeCommand('sudo powermetrics --samplers smc -n 1 2>/dev/null | grep -i temp || echo "Temperature monitoring requires admin privileges"');
            } else {
                tempInfo = await this.executeCommand('sensors 2>/dev/null || cat /sys/class/thermal/thermal_zone*/temp 2>/dev/null');
            }
            
            if (tempInfo.trim()) {
                return `🌡️ Temperature Information:
${tempInfo}`;
            } else {
                return '🌡️ Temperature: Sensors not available or require additional permissions';
            }
        } catch (error) {
            return '🌡️ Temperature: Information not available';
        }
    }
    
    static async executeCommand(command) {
        return new Promise((resolve, reject) => {
            exec(command, { timeout: 10000 }, (error, stdout, stderr) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(stdout || stderr || 'No output');
                }
            });
        });
    }

    static async openWhatsAppCall(contact) {
        const platform = os.platform();
        let command;
        
        switch (platform) {
            case 'win32':
                // Open WhatsApp and initiate call (requires WhatsApp Desktop)
                command = `start whatsapp://call?phone=${encodeURIComponent(contact)}`;
                break;
            case 'darwin':
                command = `open whatsapp://call?phone=${encodeURIComponent(contact)}`;
                break;
            default:
                command = `xdg-open whatsapp://call?phone=${encodeURIComponent(contact)}`;
                break;
        }
        
        return new Promise((resolve, reject) => {
            exec(command, (error) => {
                if (error) {
                    // Fallback to opening WhatsApp web
                    this.openWebsite('web.whatsapp.com');
                    resolve();
                } else {
                    resolve();
                }
            });
        });
    }

    static async openWhatsAppMessage(contact) {
        const platform = os.platform();
        let command;
        
        switch (platform) {
            case 'win32':
                command = `start whatsapp://send?phone=${encodeURIComponent(contact)}`;
                break;
            case 'darwin':
                command = `open whatsapp://send?phone=${encodeURIComponent(contact)}`;
                break;
            default:
                command = `xdg-open whatsapp://send?phone=${encodeURIComponent(contact)}`;
                break;
        }
        
        return new Promise((resolve, reject) => {
            exec(command, (error) => {
                if (error) {
                    this.openWebsite('web.whatsapp.com');
                    resolve();
                } else {
                    resolve();
                }
            });
        });
    }

    static async openFileLocation(location) {
        const platform = os.platform();
        let command;
        
        switch (platform) {
            case 'win32':
                const winPaths = {
                    downloads: '%USERPROFILE%\\Downloads',
                    documents: '%USERPROFILE%\\Documents',
                    desktop: '%USERPROFILE%\\Desktop',
                    pictures: '%USERPROFILE%\\Pictures',
                    music: '%USERPROFILE%\\Music'
                };
                command = `explorer "${winPaths[location] || winPaths.downloads}"`;
                break;
            case 'darwin':
                const macPaths = {
                    downloads: '~/Downloads',
                    documents: '~/Documents',
                    desktop: '~/Desktop',
                    pictures: '~/Pictures',
                    music: '~/Music'
                };
                command = `open "${macPaths[location] || macPaths.downloads}"`;
                break;
            default:
                const linuxPaths = {
                    downloads: '~/Downloads',
                    documents: '~/Documents',
                    desktop: '~/Desktop',
                    pictures: '~/Pictures',
                    music: '~/Music'
                };
                command = `xdg-open "${linuxPaths[location] || linuxPaths.downloads}"`;
                break;
        }
        
        return new Promise((resolve, reject) => {
            exec(command, (error) => {
                if (error) {
                    if (error.code === 127) {
                        reject(new Error(`File manager not found or not installed. Please ensure a file manager is installed and accessible.`));
                    } else {
                        reject(error);
                    }
                } else {
                    resolve();
                }
            });
        });
    }

    static async openSettings(settingType) {
        const platform = os.platform();
        let command;
        
        switch (platform) {
            case 'win32':
                const winSettings = {
                    main: 'ms-settings:',
                    network: 'ms-settings:network',
                    display: 'ms-settings:display',
                    sound: 'ms-settings:sound',
                    bluetooth: 'ms-settings:bluetooth',
                    privacy: 'ms-settings:privacy',
                    update: 'ms-settings:windowsupdate'
                };
                command = `start ${winSettings[settingType] || winSettings.main}`;
                break;
            case 'darwin':
                const macSettings = {
                    main: 'open -b com.apple.systempreferences',
                    network: 'open -b com.apple.systempreferences /System/Library/PreferencePanes/Network.prefPane',
                    display: 'open -b com.apple.systempreferences /System/Library/PreferencePanes/Displays.prefPane',
                    sound: 'open -b com.apple.systempreferences /System/Library/PreferencePanes/Sound.prefPane',
                    bluetooth: 'open -b com.apple.systempreferences /System/Library/PreferencePanes/Bluetooth.prefPane'
                };
                command = macSettings[settingType] || macSettings.main;
                break;
            default:
                const linuxSettings = {
                    main: 'gnome-control-center || systemsettings5 || unity-control-center',
                    network: 'gnome-control-center network || systemsettings5 kcm_networkmanagement',
                    display: 'gnome-control-center display || systemsettings5 kcm_displayconfiguration',
                    sound: 'gnome-control-center sound || systemsettings5 kcm_pulseaudio',
                    bluetooth: 'gnome-control-center bluetooth || systemsettings5 kcm_bluetooth'
                };
                command = linuxSettings[settingType] || linuxSettings.main;
                break;
        }
        
        return new Promise((resolve, reject) => {
            exec(command, (error) => {
                if (error) {
                    if (error.code === 127) {
                        reject(new Error(`Settings application not found. Please ensure system settings are accessible.`));
                    } else {
                        reject(error);
                    }
                } else {
                    resolve();
                }
            });
        });
    }

    static async openSpecificApplication(appName) {
        const platform = os.platform();
        const app = appName.toLowerCase();
        let command;
        
        // Common applications mapping
        const appMappings = {
            win32: {
                'chrome': 'start chrome',
                'firefox': 'start firefox',
                'edge': 'start msedge',
                'notepad': 'notepad',
                'calculator': 'calc',
                'paint': 'mspaint',
                'word': 'start winword',
                'excel': 'start excel',
                'powerpoint': 'start powerpnt',
                'outlook': 'start outlook',
                'teams': 'start ms-teams:',
                'zoom': 'start zoommtg:',
                'discord': 'start discord:',
                'spotify': 'start spotify:',
                'steam': 'start steam:',
                'vscode': 'code',
                'photoshop': 'start photoshop',
                'illustrator': 'start illustrator',
                'premiere': 'start premiere',
                'aftereffects': 'start aftereffects'
            },
            darwin: {
                'chrome': 'open -a "Google Chrome"',
                'firefox': 'open -a Firefox',
                'safari': 'open -a Safari',
                'textedit': 'open -a TextEdit',
                'calculator': 'open -a Calculator',
                'word': 'open -a "Microsoft Word"',
                'excel': 'open -a "Microsoft Excel"',
                'powerpoint': 'open -a "Microsoft PowerPoint"',
                'outlook': 'open -a "Microsoft Outlook"',
                'teams': 'open -a "Microsoft Teams"',
                'zoom': 'open -a zoom.us',
                'discord': 'open -a Discord',
                'spotify': 'open -a Spotify',
                'steam': 'open -a Steam',
                'vscode': 'open -a "Visual Studio Code"',
                'photoshop': 'open -a "Adobe Photoshop"',
                'illustrator': 'open -a "Adobe Illustrator"',
                'premiere': 'open -a "Adobe Premiere Pro"'
            },
            linux: {
                'chrome': 'google-chrome || chromium-browser',
                'firefox': 'firefox',
                'gedit': 'gedit',
                'calculator': 'gnome-calculator || kcalc',
                'libreoffice': 'libreoffice',
                'writer': 'libreoffice --writer',
                'calc': 'libreoffice --calc',
                'impress': 'libreoffice --impress',
                'thunderbird': 'thunderbird',
                'discord': 'discord',
                'spotify': 'spotify',
                'steam': 'steam',
                'vscode': 'code',
                'gimp': 'gimp',
                'inkscape': 'inkscape'
            }
        };
        
        const platformApps = appMappings[platform] || appMappings.linux;
        command = platformApps[app];
        
        if (!command) {
            // Try generic approach
            switch (platform) {
                case 'win32':
                    command = `start ${appName}`;
                    break;
                case 'darwin':
                    command = `open -a "${appName}"`;
                    break;
                default:
                    command = appName;
                    break;
            }
        }
        
        return new Promise((resolve, reject) => {
            exec(command, (error) => {
                if (error) {
                    if (error.code === 127) {
                        reject(new Error(`Application "${appName}" not found or not installed. Please ensure it's installed and in your system's PATH.`));
                    } else {
                        reject(error);
                    }
                } else {
                    resolve();
                }
            });
        });
    }

    static async openWebsite(url) {
        const fullUrl = url.startsWith('http') ? url : `https://${url}`;
        const platform = os.platform();
        
        let command;
        switch (platform) {
            case 'darwin': // macOS
                command = `open "${fullUrl}"`;
                break;
            case 'win32': // Windows
                command = `start "" "${fullUrl}"`;
                break;
            default: // Linux and others
                command = `xdg-open "${fullUrl}"`;
                break;
        }
        
        return new Promise((resolve, reject) => {
            exec(command, (error) => {
                if (error) {
                    if (error.code === 127) {
                        reject(new Error(`Web browser not found. Please ensure a web browser is installed and accessible.`));
                    } else {
                        reject(error);
                    }
                } else {
                    resolve();
                }
            });
        });
    }

    static async openApplication(appName) {
        const platform = os.platform();
        let command;
        
        switch (platform) {
            case 'darwin': // macOS
                const macApps = {
                    calculator: 'open -a Calculator',
                    notepad: 'open -a TextEdit',
                    filemanager: 'open -a Finder',
                    whatsapp: 'open -a WhatsApp'
                };
                command = macApps[appName];
                break;
                
            case 'win32': // Windows
                const winApps = {
                    calculator: 'calc',
                    notepad: 'notepad',
                    filemanager: 'explorer',
                    whatsapp: 'start whatsapp:'
                };
                command = winApps[appName];
                break;
                
            default: // Linux
                const linuxApps = {
                    calculator: 'gnome-calculator || kcalc || xcalc',
                    notepad: 'echo "Text editor not available in this environment"',
                    filemanager: 'echo "File manager not available in this environment"',
                    whatsapp: 'xdg-open https://web.whatsapp.com'
                };
                command = linuxApps[appName];
                break;
        }
        
        if (command) {
            return new Promise((resolve, reject) => {
                exec(command, (error) => {
                    if (error) {
                        if (error.code === 127) {
                            reject(new Error(`Application "${appName}" not found or not installed. Please ensure it's installed and in your system's PATH.`));
                        } else {
                            reject(error);
                        }
                    } else {
                        resolve();
                    }
                });
            });
        } else {
            throw new Error(`Application "${appName}" not available on this platform`);
        }
    }

    static async systemShutdown(seconds = 60) {
        const platform = os.platform();
        let command;
        
        switch (platform) {
            case 'darwin': // macOS
                command = `sudo shutdown -h +${Math.ceil(seconds / 60)}`;
                break;
            case 'win32': // Windows
                command = `shutdown /s /t ${seconds}`;
                break;
            default: // Linux
                command = `sudo shutdown -h +${Math.ceil(seconds / 60)}`;
                break;
        }
        
        return new Promise((resolve, reject) => {
            exec(command, (error) => {
                if (error) {
                    if (error.code === 127) {
                        reject(new Error(`Shutdown command not available or requires administrator privileges.`));
                    } else {
                        reject(error);
                    }
                } else {
                    resolve();
                }
            });
        });
    }

    static async systemRestart() {
        const platform = os.platform();
        let command;
        
        switch (platform) {
            case 'darwin': // macOS
                command = 'sudo shutdown -r now';
                break;
            case 'win32': // Windows
                command = 'shutdown /r /t 10';
                break;
            default: // Linux
                command = 'sudo reboot';
                break;
        }
        
        return new Promise((resolve, reject) => {
            exec(command, (error) => {
                if (error) {
                    if (error.code === 127) {
                        reject(new Error(`Restart command not available or requires administrator privileges.`));
                    } else {
                        reject(error);
                    }
                } else {
                    resolve();
                }
            });
        });
    }

    static async systemSleep() {
        const platform = os.platform();
        let command;
        
        switch (platform) {
            case 'darwin': // macOS
                command = 'pmset sleepnow';
                break;
            case 'win32': // Windows
                command = 'rundll32.exe powrprof.dll,SetSuspendState 0,1,0';
                break;
            default: // Linux
                command = 'systemctl suspend';
                break;
        }
        
        return new Promise((resolve, reject) => {
            exec(command, (error) => {
                if (error) {
                    if (error.code === 127) {
                        reject(new Error(`Sleep command not available or requires administrator privileges.`));
                    } else {
                        reject(error);
                    }
                } else {
                    resolve();
                }
            });
        });
    }

    static async adjustVolume(action) {
        const platform = os.platform();
        let command;
        
        switch (platform) {
            case 'darwin': // macOS
                const macCommands = {
                    up: 'osascript -e "set volume output volume (output volume of (get volume settings) + 10)"',
                    down: 'osascript -e "set volume output volume (output volume of (get volume settings) - 10)"',
                    mute: 'osascript -e "set volume output muted true"'
                };
                command = macCommands[action];
                break;
                
            case 'win32': // Windows
                const winCommands = {
                    up: 'nircmd.exe changesysvolume 6553',
                    down: 'nircmd.exe changesysvolume -6553',
                    mute: 'nircmd.exe mutesysvolume 1'
                };
                command = winCommands[action];
                break;
                
            default: // Linux
                const linuxCommands = {
                    up: 'amixer -D pulse sset Master 10%+',
                    down: 'amixer -D pulse sset Master 10%-',
                    mute: 'amixer -D pulse sset Master mute'
                };
                command = linuxCommands[action];
                break;
        }
        
        if (command) {
            return new Promise((resolve, reject) => {
                exec(command, (error) => {
                    if (error) {
                        if (error.code === 127) {
                            reject(new Error(`Volume control not available. Please ensure audio system is properly configured.`));
                        } else {
                            reject(error);
                        }
                    } else {
                        resolve();
                    }
                });
            });
        } else {
            throw new Error(`Volume control not available on this platform`);
        }
    }
}

// Get __dirname equivalent for ES modules
const __dirname = path.dirname(new URL(import.meta.url).pathname);

// API Routes
app.get('/api/status', (req, res) => {
    res.json({ 
        status: 'online', 
        platform: os.platform(),
        timestamp: new Date().toISOString()
    });
});

app.post('/api/execute', async (req, res) => {
    try {
        const { text, type } = req.body;
        const userAgent = req.headers['user-agent'] || '';
        
        if (!text || !type) {
            return res.status(400).json({ error: 'Missing required fields: text, type' });
        }

        // Process the command
        const result = await CommandProcessor.processCommand(text, userAgent);
        
        // Save to database with fallback
        const command = await saveCommand({
            text,
            type,
            status: result.status,
            response: result.response,
            userAgent
        });
        
        res.json({
            id: command._id,
            response: result.response,
            status: result.status,
            timestamp: command.timestamp
        });
        
    } catch (error) {
        console.error('API Error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/history', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const commands = await getCommands(limit);
        
        res.json(commands);
    } catch (error) {
        console.error('History fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch history' });
    }
});

app.delete('/api/history', async (req, res) => {
    try {
        await clearCommands();
        res.json({ message: 'History cleared successfully' });
    } catch (error) {
        console.error('History clear error:', error);
        res.status(500).json({ error: 'Failed to clear history' });
    }
});

// System information endpoints
app.get('/api/system-info', async (req, res) => {
    try {
        const info = await CommandProcessor.getSystemInfo();
        res.json({ info });
    } catch (error) {
        console.error('System info error:', error);
        res.status(500).json({ error: 'Failed to get system information' });
    }
});

app.get('/api/memory-info', async (req, res) => {
    try {
        const info = await CommandProcessor.getMemoryInfo();
        res.json({ info });
    } catch (error) {
        console.error('Memory info error:', error);
        res.status(500).json({ error: 'Failed to get memory information' });
    }
});

app.get('/api/storage-info', async (req, res) => {
    try {
        const info = await CommandProcessor.getStorageInfo();
        res.json({ info });
    } catch (error) {
        console.error('Storage info error:', error);
        res.status(500).json({ error: 'Failed to get storage information' });
    }
});

app.get('/api/cpu-info', async (req, res) => {
    try {
        const info = await CommandProcessor.getCPUInfo();
        res.json({ info });
    } catch (error) {
        console.error('CPU info error:', error);
        res.status(500).json({ error: 'Failed to get CPU information' });
    }
});

app.get('/api/network-info', async (req, res) => {
    try {
        const info = await CommandProcessor.getNetworkInfo();
        res.json({ info });
    } catch (error) {
        console.error('Network info error:', error);
        res.status(500).json({ error: 'Failed to get network information' });
    }
});

// Serve the main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📱 Platform: ${os.platform()}`);
    console.log(`🗄️  Database: ${MONGODB_URI}`);
});