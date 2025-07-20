# Voice & Text Control Application

A powerful cross-platform application that allows you to control your computer using voice commands and text input. Built with HTML, CSS, JavaScript frontend and Node.js with MongoDB backend.

## Features

### 🎤 Voice Control
- Real-time speech recognition
- Cross-browser compatibility
- Visual feedback during listening
- Support for natural language commands

### ⌨️ Text Commands
- Text input interface
- Quick command suggestions
- Command history with search
- Export functionality

### 🖥️ System Control
- **Web Navigation**: Open websites, search Google/YouTube
- **Applications**: Launch calculator, notepad, file manager
- **System Operations**: Shutdown, restart, sleep (with permissions)
- **Volume Control**: Increase, decrease, mute system volume
- **Time & Date**: Get current time and date information

### 📱 Cross-Platform Support
- **Desktop**: Windows, macOS, Linux
- **Mobile**: iOS Safari, Android Chrome
- **Browsers**: Chrome, Firefox, Safari, Edge

## Installation

### Prerequisites
- Node.js (v14 or higher)
- MongoDB (local or Atlas)
- Modern web browser

### Setup Instructions

1. **Clone or create the project structure**
2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure MongoDB**:
   - For local MongoDB: Ensure MongoDB is running on `mongodb://localhost:27017`
   - For MongoDB Atlas: Update the `.env` file with your connection string

4. **Start the application**:
   ```bash
   # Development mode with auto-restart
   npm run server
   
   # Production mode
   npm start
   ```

5. **Access the application**:
   Open your browser and navigate to `http://localhost:3000`

## Available Commands

### Web Commands
- `"open google.com"` - Opens Google
- `"open youtube.com"` - Opens YouTube
- `"search pizza recipes"` - Google search
- `"youtube funny cats"` - YouTube search

### System Information
- `"what time is it"` - Current time
- `"what date is it"` - Current date
- `"weather"` - Opens weather website

### Applications
- `"open calculator"` - Launch calculator
- `"open notepad"` - Launch text editor
- `"open file manager"` - Launch file explorer

### System Control (requires permissions)
- `"shutdown in 5 minutes"` - Schedule shutdown
- `"restart"` - Restart system
- `"sleep"` - Put system to sleep

### Volume Control
- `"volume up"` - Increase volume
- `"volume down"` - Decrease volume
- `"mute"` - Mute system audio

## API Endpoints

### GET `/api/status`
Returns server status and platform information.

### POST `/api/execute`
Execute a voice or text command.
```json
{
  "text": "open google.com",
  "type": "voice" // or "text"
}
```

### GET `/api/history`
Retrieve command history (last 50 commands by default).

### DELETE `/api/history`
Clear all command history.

## Database Schema

Commands are stored in MongoDB with the following structure:
```javascript
{
  text: String,           // Command text
  type: String,           // 'voice' or 'text'
  timestamp: Date,        // When executed
  status: String,         // 'success' or 'error'
  response: String,       // Command response
  platform: String,      // Operating system
  userAgent: String       // Browser information
}
```

## Security Considerations

### Browser Limitations
- System commands work differently across platforms
- Some operations require elevated permissions
- Web browsers restrict certain system access for security

### Permissions Required
- **Microphone**: For voice recognition
- **System Commands**: May require administrator/sudo privileges
- **Application Launch**: Platform-specific permissions

## Browser Compatibility

### Voice Recognition Support
- ✅ Chrome (Desktop & Mobile)
- ✅ Safari (Desktop & Mobile)
- ✅ Edge (Desktop)
- ⚠️ Firefox (Limited support)

### Mobile Considerations
- Touch-friendly interface
- Responsive design
- Mobile-specific command adaptations
- Battery optimization for voice recognition

## Troubleshooting

### Common Issues

1. **Voice recognition not working**:
   - Check microphone permissions
   - Ensure HTTPS (required for microphone access)
   - Try different browsers

2. **System commands failing**:
   - Check platform compatibility
   - Verify required permissions
   - Review error logs in browser console

3. **MongoDB connection issues**:
   - Ensure MongoDB is running
   - Check connection string in `.env`
   - Verify network connectivity

### Development Tips

1. **Testing voice commands**:
   - Use text input for consistent testing
   - Check browser console for errors
   - Monitor network requests

2. **Adding new commands**:
   - Modify `CommandProcessor.processCommand()` in `server.js`
   - Add corresponding UI suggestions
   - Test across different platforms

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure cross-platform compatibility
5. Submit a pull request

## License

This project is open source and available under the MIT License.

## Support

For issues and questions:
- Check the troubleshooting section
- Review browser console for errors
- Ensure all dependencies are installed
- Verify MongoDB connection