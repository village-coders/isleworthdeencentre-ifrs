// test-login.js
const axios = require('axios');

async function testLogin() {
  const baseURL = 'https://hfa-internal-record-system.onrender.com/api';
  
  console.log('Testing admin login...\n');
  
  // Test 1: Try with username 'admin'
  console.log('Test 1: Username = "admin", Password = "Admin@123"');
  try {
    const response1 = await axios.post(`${baseURL}/auth/login`, {
      username: 'admin',
      password: 'Admin@123'
    });
    console.log('✅ Success:', response1.data.message || 'Logged in');
    console.log('User:', response1.data.data.user.name);
  } catch (error) {
    console.log('❌ Failed:', error.response?.data?.message || error.message);
  }
  
  // Test 2: Try with email 'admin@hfa-uk.com'
  console.log('\nTest 2: Username = "admin@hfa-uk.com", Password = "Admin@123"');
  try {
    const response2 = await axios.post(`${baseURL}/auth/login`, {
      username: 'admin@hfa-uk.com',
      password: 'Admin@123'
    });
    console.log('✅ Success:', response2.data.message || 'Logged in');
    console.log('User:', response2.data.data.user.name);
  } catch (error) {
    console.log('❌ Failed:', error.response?.data?.message || error.message);
  }
  
  // Test 3: Check what users exist
  console.log('\nTest 3: Checking all users in database');
  try {
    const response3 = await axios.get(`${baseURL}/auth/debug-users`);
    console.log('Users found:');
    response3.data.data.forEach(user => {
      console.log(`  - ${user.employee_id} (${user.email}): ${user.name} - ${user.role}`);
    });
  } catch (error) {
    console.log('❌ Failed to get users:', error.message);
  }
}

testLogin();