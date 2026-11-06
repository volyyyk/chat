/**
 * Tests for MedChat Server
 */

const WebSocket = require('ws');
const { server, wss } = require('../src/index');
const MessageRouter = require('../src/messageRouter');

// Test configuration
const TEST_PORT = 3001;
const TEST_SERVER_URL = `ws://localhost:${TEST_PORT}`;

// Test data
const testDoctorId = 'test-doctor-' + Date.now();
const testPatientId = 'test-patient-' + Date.now();

// Helper functions
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Test suite
describe('MedChat Server', () => {
  let testServer;
  let testWss;
  
  beforeAll(async () => {
    // Start test server
    process.env.PORT = TEST_PORT;
    process.env.NODE_ENV = 'test';
    
    // Mock the server creation
    testServer = server;
    testWss = wss;
    
    // Wait for server to start
    await delay(500);
  }, 10000);
  
  afterAll(async () => {
    // Close all connections
    testWss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.close();
      }
    });
    
    // Close server
    if (testServer) {
      testServer.close();
    }
    
    await delay(500);
  }, 5000);
  
  describe('WebSocket Connection', () => {
    it('should accept WebSocket connections', async () => {
      const ws = new WebSocket(TEST_SERVER_URL);
      
      const result = await new Promise((resolve) => {
        ws.on('open', () => {
          resolve({ success: true });
        });
        
        ws.on('error', (error) => {
          resolve({ success: false, error });
        });
      });
      
      expect(result.success).toBe(true);
      ws.close();
      await delay(100);
    }, 5000);
    
    it('should send welcome message on connection', async () => {
      const ws = new WebSocket(TEST_SERVER_URL);
      
      const result = await new Promise((resolve) => {
        ws.on('message', (data) => {
          const message = JSON.parse(data.toString());
          if (message.type === 'welcome') {
            resolve(message);
          }
        });
        
        ws.on('error', (error) => {
          resolve({ error });
        });
      });
      
      expect(result.type).toBe('welcome');
      expect(result.server).toBe('MedChat');
      expect(result.version).toBeDefined();
      expect(result.connectionId).toBeDefined();
      
      ws.close();
      await delay(100);
    }, 5000);
  });
  
  describe('Authentication', () => {
    it('should authenticate doctor', async () => {
      const ws = new WebSocket(TEST_SERVER_URL);
      
      // Wait for welcome message
      await new Promise(resolve => ws.once('message', resolve));
      
      // Send auth message
      ws.send(JSON.stringify({
        type: 'auth',
        role: 'doctor',
        doctorId: testDoctorId
      }));
      
      const result = await new Promise((resolve) => {
        ws.on('message', (data) => {
          const message = JSON.parse(data.toString());
          if (message.type === 'auth_success') {
            resolve(message);
          }
        });
      });
      
      expect(result.type).toBe('auth_success');
      expect(result.role).toBe('doctor');
      expect(result.doctorId).toBe(testDoctorId);
      
      ws.close();
      await delay(100);
    }, 5000);
    
    it('should authenticate patient', async () => {
      // First, authenticate a doctor
      const doctorWs = new WebSocket(TEST_SERVER_URL);
      await new Promise(resolve => doctorWs.once('message', resolve));
      
      doctorWs.send(JSON.stringify({
        type: 'auth',
        role: 'doctor',
        doctorId: testDoctorId
      }));
      
      await new Promise((resolve) => {
        doctorWs.on('message', (data) => {
          const message = JSON.parse(data.toString());
          if (message.type === 'auth_success') {
            resolve();
          }
        });
      });
      
      // Now authenticate patient
      const patientWs = new WebSocket(TEST_SERVER_URL);
      await new Promise(resolve => patientWs.once('message', resolve));
      
      patientWs.send(JSON.stringify({
        type: 'auth',
        role: 'patient',
        doctorId: testDoctorId,
        patientId: testPatientId
      }));
      
      const result = await new Promise((resolve) => {
        patientWs.on('message', (data) => {
          const message = JSON.parse(data.toString());
          if (message.type === 'auth_success') {
            resolve(message);
          }
        });
      });
      
      expect(result.type).toBe('auth_success');
      expect(result.role).toBe('patient');
      expect(result.doctorId).toBe(testDoctorId);
      expect(result.patientId).toBe(testPatientId);
      
      // Check if doctor was notified
      const notification = await new Promise((resolve) => {
        doctorWs.on('message', (data) => {
          const message = JSON.parse(data.toString());
          if (message.type === 'new_patient') {
            resolve(message);
          }
        });
      });
      
      expect(notification.type).toBe('new_patient');
      expect(notification.patientId).toBe(testPatientId);
      
      doctorWs.close();
      patientWs.close();
      await delay(100);
    }, 10000);
    
    it('should handle patient authentication when doctor is offline', async () => {
      const patientWs = new WebSocket(TEST_SERVER_URL);
      await new Promise(resolve => patientWs.once('message', resolve));
      
      patientWs.send(JSON.stringify({
        type: 'auth',
        role: 'patient',
        doctorId: 'offline-doctor-' + Date.now(),
        patientId: testPatientId
      }));
      
      const result = await new Promise((resolve) => {
        patientWs.on('message', (data) => {
          const message = JSON.parse(data.toString());
          if (message.type === 'auth_pending') {
            resolve(message);
          }
        });
      });
      
      expect(result.type).toBe('auth_pending');
      expect(result.role).toBe('patient');
      expect(result.message).toContain('Waiting for doctor');
      
      patientWs.close();
      await delay(100);
    }, 5000);
  });
  
  describe('Message Routing', () => {
    it('should route messages between doctor and patient', async () => {
      // Authenticate doctor
      const doctorWs = new WebSocket(TEST_SERVER_URL);
      await new Promise(resolve => doctorWs.once('message', resolve));
      
      doctorWs.send(JSON.stringify({
        type: 'auth',
        role: 'doctor',
        doctorId: testDoctorId
      }));
      
      await new Promise((resolve) => {
        doctorWs.on('message', (data) => {
          const message = JSON.parse(data.toString());
          if (message.type === 'auth_success') {
            resolve();
          }
        });
      });
      
      // Authenticate patient
      const patientWs = new WebSocket(TEST_SERVER_URL);
      await new Promise(resolve => patientWs.once('message', resolve));
      
      patientWs.send(JSON.stringify({
        type: 'auth',
        role: 'patient',
        doctorId: testDoctorId,
        patientId: testPatientId
      }));
      
      await new Promise((resolve) => {
        patientWs.on('message', (data) => {
          const message = JSON.parse(data.toString());
          if (message.type === 'auth_success') {
            resolve();
          }
        });
      });
      
      // Send message from patient to doctor
      const testMessage = {
        type: 'message',
        to: testDoctorId,
        encryptedData: 'test-encrypted-data',
        nonce: 'test-nonce',
        from: testPatientId
      };
      
      patientWs.send(JSON.stringify(testMessage));
      
      // Check if doctor received the message
      const receivedMessage = await new Promise((resolve) => {
        doctorWs.on('message', (data) => {
          const message = JSON.parse(data.toString());
          if (message.type === 'message' && message.from === testPatientId) {
            resolve(message);
          }
        });
      });
      
      expect(receivedMessage.type).toBe('message');
      expect(receivedMessage.from).toBe(testPatientId);
      expect(receivedMessage.to).toBe(testDoctorId);
      expect(receivedMessage.encryptedData).toBe('test-encrypted-data');
      
      // Check delivery confirmation
      const confirmation = await new Promise((resolve) => {
        patientWs.on('message', (data) => {
          const message = JSON.parse(data.toString());
          if (message.type === 'message_status' && message.status === 'delivered') {
            resolve(message);
          }
        });
      });
      
      expect(confirmation.status).toBe('delivered');
      expect(confirmation.recipients).toBe(1);
      
      doctorWs.close();
      patientWs.close();
      await delay(100);
    }, 10000);
  });
  
  describe('QR Code Generation', () => {
    it('should generate QR code for doctor', async () => {
      const ws = new WebSocket(TEST_SERVER_URL);
      await new Promise(resolve => ws.once('message', resolve));
      
      // Authenticate as doctor
      ws.send(JSON.stringify({
        type: 'auth',
        role: 'doctor',
        doctorId: testDoctorId
      }));
      
      await new Promise((resolve) => {
        ws.on('message', (data) => {
          const message = JSON.parse(data.toString());
          if (message.type === 'auth_success') {
            resolve();
          }
        });
      });
      
      // Request QR code
      ws.send(JSON.stringify({
        type: 'generate_qr'
      }));
      
      const result = await new Promise((resolve) => {
        ws.on('message', (data) => {
          const message = JSON.parse(data.toString());
          if (message.type === 'qr_generated') {
            resolve(message);
          }
        });
      });
      
      expect(result.type).toBe('qr_generated');
      expect(result.doctorId).toBe(testDoctorId);
      expect(result.deepLink).toContain('medchat://connect');
      expect(result.deepLink).toContain(testDoctorId);
      
      ws.close();
      await delay(100);
    }, 5000);
  });
  
  describe('Health Check', () => {
    it('should respond to health check', async () => {
      const http = require('http');
      
      const result = await new Promise((resolve) => {
        http.get(`http://localhost:${TEST_PORT}/health`, (res) => {
          let data = '';
          
          res.on('data', chunk => {
            data += chunk;
          });
          
          res.on('end', () => {
            resolve({
              status: res.statusCode,
              data: JSON.parse(data)
            });
          });
        }).on('error', (error) => {
          resolve({ error });
        });
      });
      
      expect(result.status).toBe(200);
      expect(result.data.status).toBe('ok');
      expect(result.data.timestamp).toBeDefined();
    }, 5000);
  });
});

// Run tests if this file is executed directly
if (require.main === module) {
  console.log('Running MedChat Server tests...');
  console.log('Note: Make sure the server is running on port 3001');
}
