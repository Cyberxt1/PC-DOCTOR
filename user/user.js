// User Login, Tabs, and Issue Form Logic

document.addEventListener('DOMContentLoaded', function() {
  const loginScreen = document.getElementById('login-screen');
  const dashboard = document.getElementById('dashboard');
  const loginBtn = document.getElementById('login-btn');
  const usernameInp = document.getElementById('username');
  const logoutBtn = document.getElementById('logout-btn');
  const userDisplay = document.getElementById('user-display');
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');
  const deviceType = document.getElementById('device-type');
  const deviceDetails = document.getElementById('device-details');
  const issueForm = document.getElementById('issue-form');
  const formMsg = document.getElementById('form-msg');
  const historyList = document.getElementById('history-list');

  // // --- Login Logic ---
  // loginBtn.onclick = function() {
  //   const username = usernameInp.value.trim();
  //   if (!username) return alert('Enter your username');
  //   loginScreen.classList.add('hidden');
  //   dashboard.classList.remove('hidden');
  //   userDisplay.textContent = username;
  //   loadHistory();
  // };
  // logoutBtn.onclick = function() {
  //   dashboard.classList.add('hidden');
  //   loginScreen.classList.remove('hidden');
  //   usernameInp.value = '';
  // };

  // --- Tabs Logic ---
  tabBtns.forEach(btn => {
    btn.onclick = function() {
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.getAttribute('data-tab');
      tabContents.forEach(cont => cont.classList.remove('active'));
      document.getElementById(tab).classList.add('active');
    };
  });

  // --- Dynamic Device Fields ---
  deviceType?.addEventListener('change', function() {
    const v = deviceType.value;
    let html = '';
    if (v === 'phone') {
      html = `
        <label for="phone-model">Phone Model</label>
        <select id="phone-model" required>
          <option value="">Select model</option>
          <option>Samsung Galaxy S23</option>
          <option>iPhone 14</option>
          <option>Infinix Hot 40</option>
          <option>Other</option>
        </select>
      `;
    } else if (v === 'laptop') {
      html = `
        <label for="laptop-processor">Processor Info</label>
        <input id="laptop-processor" type="text" placeholder="e.g. Intel i5 11th Gen" required>
        <label for="laptop-os">Operating System Version</label>
        <input id="laptop-os" type="text" placeholder="e.g. Windows 11 Pro" required>
      `;
    }
    deviceDetails.innerHTML = html;
  });

  // --- Issue Form Submission ---
  issueForm?.addEventListener('submit', function(e) {
    e.preventDefault();
    // Gather info
    const desc = document.getElementById('issue-desc').value.trim();
    const devType = deviceType.value;
    let details = '';
    if (devType === 'phone') {
      const model = document.getElementById('phone-model')?.value || '';
      details = `Phone Model: ${model}`;
    } else if (devType === 'laptop') {
      const proc = document.getElementById('laptop-processor')?.value || '';
      const os = document.getElementById('laptop-os')?.value || '';
      details = `Processor: ${proc}, OS: ${os}`;
    }
    if (!desc || !devType || (devType === 'phone' && !details.includes('Model: ')) || (devType === 'laptop' && (!details.includes('Processor:') || !details.includes('OS:')))) {
      formMsg.textContent = 'Please fill in all required fields.';
      formMsg.style.color = '#f44';
      return;
    }
    // Dummy "submit" (simulate to admin)
    addHistory({ time: new Date().toLocaleString(), device: devType, desc, details });
    formMsg.textContent = 'Issue submitted! Our admin will review it shortly.';
    formMsg.style.color = '#3a5f3a';
    issueForm.reset();
    deviceDetails.innerHTML = '';
    setTimeout(() => formMsg.textContent = '', 3500);
  });

  // --- History List Sample ---
  function loadHistory() {
    historyList.innerHTML = '';
    const sample = JSON.parse(localStorage.getItem('userHistory') || '[]');
    sample.forEach(entry => {
      const li = document.createElement('li');
      li.textContent = `[${entry.time}] (${entry.device}) - ${entry.desc} [${entry.details}]`;
      historyList.appendChild(li);
    });
  }
  function addHistory(entry) {
    const arr = JSON.parse(localStorage.getItem('userHistory') || '[]');
    arr.unshift(entry);
    localStorage.setItem('userHistory', JSON.stringify(arr.slice(0, 10)));
    loadHistory();
  }
});