// -----------------------------------------------
// Paylance Frontend — MongoDB Version
// localStorage HATAO, API calls LAGAO
// -----------------------------------------------

const API = '/api';

// App State
let currentUser       = null;
let balance           = 0;
let transactions      = [];
let balanceVisible    = true;
let cashbackPoints    = 0;
let monthlyBudget     = 50000;
let financialGoals    = [];
let recurringPayments = [];
let forgotPinMobile   = null;
let forgotPinEmail    = null;
let pendingRegistration = null;
let otpTimerInterval    = null;
let lastBiometricMobile = '';

let expenseCategories = {
    'Shopping':0,'Food':0,'Transport':0,'Bills':0,'Entertainment':0,'Others':0
};

// -----------------------------------------------
// HELPER — API call (JWT auto-attach)
// -----------------------------------------------
// ✅ Naya — credentials: 'include' add karo
async function apiCall(method, endpoint, body = null) {
    const options = {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'  // ← YEH ADD KARO — cookie automatically jaayegi
    };
    if (body) options.body = JSON.stringify(body);
    const res  = await fetch(`${API}${endpoint}`, options);
    const data = await res.json();
    return { ok: res.ok, status: res.status, data };
}

// -----------------------------------------------
// INIT
// -----------------------------------------------
// ✅ Yeh karo
window.addEventListener('load', async function () {
    updateGreeting();
    updateBiometricButton();

    try {
        const res = await fetch('/api/user/me', {
            credentials: 'include'
        });

        if (res.ok) {
            const data = await res.json();
            if (data && data.user) {
                // Session valid — seedha dashboard
                loadUserIntoApp(data.user);
                document.getElementById('splashScreen').style.display = 'none';
                showDashboard();
                return; // ← Yeh zaroori hai
            }
        }
    } catch (err) {
        console.log('Session check failed:', err);
    }

    // Token nahi ya invalid — login screen
    setTimeout(() => {
        document.getElementById('splashScreen').style.display = 'none';
        document.getElementById('loginPage').style.display = 'flex';
    }, 2500);
});

// -----------------------------------------------
// LOGIN
// -----------------------------------------------
async function login() {
    const mobile = document.getElementById('mobileNumber').value.trim();
    const mpin   = document.getElementById('mpin').value.trim();

    if (!mobile || mobile.length !== 11 || !mobile.startsWith('03')) {
        alert('❌ Please enter a valid mobile number (11 digits starting with 03)!'); return;
    }
    if (!mpin || mpin.length !== 5) {
        alert('❌ Please enter a valid 5-digit PIN!'); return;
    }

    try {
        const { ok, data } = await apiCall('POST', '/login', { mobile, pin: mpin });
        if (ok) {
            loadUserIntoApp(data.user);
            showDashboard();
        } else {
            alert('❌ ' + (data.message || 'Invalid mobile number or PIN!'));
        }
    } catch (err) {
        alert('❌ Cannot connect to server!\n\nMake sure server is running:\nnode server.js');
    }
}

function loadUserIntoApp(user) {
    currentUser       = user;
    balance           = user.balance           || 0;
    cashbackPoints    = user.cashbackPoints    || 0;
    monthlyBudget     = user.monthlyBudget     || 50000;
    financialGoals    = user.goals             || [];
    recurringPayments = user.recurringPayments || [];
    transactions      = user.transactions      || [];
    // KYC & account type
    currentUser.accountType      = user.accountType      || 'basic';
    currentUser.kyc              = user.kyc              || null;
    currentUser.cards            = user.cards            || [];
    currentUser.transactionLimit = user.transactionLimit || (user.accountType === 'verified' ? 500000 : 25000);
}

// DB se fresh data reload karo
// called after transactions load to refresh all displays
function onTransactionsLoaded() {
    updateIncomeExpenseDisplay();
    updateProfileStats();
}

async function refreshUserData() {
    if (!currentUser) return;
    try {
        const { ok, data } = await apiCall('GET', `/user/${currentUser.mobile}`);
        if (ok) {
            balance           = data.balance           || 0;
            cashbackPoints    = data.cashbackPoints    || 0;
            monthlyBudget     = data.monthlyBudget     || 50000;
            financialGoals    = data.goals             || [];
            recurringPayments = data.recurringPayments || [];
            transactions      = data.transactions      || [];
            currentUser = { ...currentUser, ...data };
            currentUser.accountType      = data.accountType      || 'basic';
            currentUser.kyc              = data.kyc              || null;
            currentUser.cards            = data.cards            || [];
            currentUser.transactionLimit = data.transactionLimit || (data.accountType === 'verified' ? 500000 : 25000);
            updateBalanceDisplay();
            loadTransactions();
            updateBudgetDisplay();
            updateGoalsDisplay();
            updateCashbackDisplay();
            updateProfileUI();
        }
    } catch { /* silent fail */ }
}

function showDashboard() {
    document.getElementById('loginPage').style.display  = 'none';
    document.getElementById('dashboard').style.display  = 'block';
    // Chatbot sirf dashboard pe dikhao
    const cb = document.getElementById('chatbotBtn');
    if (cb) cb.style.display = 'flex';
    const maskedNumber = currentUser.mobile.substring(0, 4) + '-' + 'X'.repeat(7);
    document.getElementById('accountNumber').textContent = maskedNumber;
    document.getElementById('userName').textContent      = currentUser.name;
    updateGreeting();
    updateBalanceDisplay();
    loadTransactions();
    updateBudgetDisplay();
    updateGoalsDisplay();
    updateCashbackDisplay();
    updateBiometricButton();
    updateIncomeExpenseDisplay();
    updateProfileStats();
    updateProfileUI();
    // DB se fresh data sync karo
    refreshUserData();

    // Biometric offer karo agar abhi enabled nahi hai
    if (!currentUser.biometricEnabled && window.PublicKeyCredential) {
        const alreadyAsked = localStorage.getItem('paylance_biometric_asked_' + currentUser.mobile);
        if (!alreadyAsked) {
            setTimeout(() => offerBiometricSetup(), 1500);
        }
    }
}

// Login ke baad biometric setup offer karo
async function offerBiometricSetup() {
    const modal = document.createElement('div');
    modal.id = 'biometricOfferModal';
    modal.style.cssText = `
        position:fixed; top:0; left:0; width:100%; height:100%;
        background:rgba(0,0,0,0.6); z-index:99999;
        display:flex; align-items:center; justify-content:center;
    `;
    modal.innerHTML = `
        <div style="background:#fff; border-radius:24px; padding:32px 24px;
                    width:90%; max-width:380px; text-align:center;
                    box-shadow:0 20px 60px rgba(0,0,0,0.3);">
            <div style="font-size:60px; margin-bottom:12px;">🔐</div>
            <h2 style="color:#6C5CE7; margin:0 0 8px; font-size:20px;">Enable Biometric Login</h2>
            <p style="color:#636e72; font-size:14px; margin:0 0 24px; line-height:1.5;">
                Login faster with <b>Face ID or Fingerprint</b>.<br>No need to enter your PIN every time!
            </p>
            <button onclick="setupBiometricNow()" style="
                width:100%; padding:14px; margin-bottom:10px;
                background:linear-gradient(135deg,#6C5CE7,#A29BFE);
                color:#fff; border:none; border-radius:14px;
                font-size:15px; font-weight:700; cursor:pointer;">
                <i class='fas fa-fingerprint'></i> Enable Now
            </button>
            <button onclick="dismissBiometricOffer()" style="
                width:100%; padding:12px;
                background:transparent; color:#636e72;
                border:1.5px solid #dfe6e9; border-radius:14px;
                font-size:14px; cursor:pointer;">
                Maybe Later
            </button>
        </div>
    `;
    document.body.appendChild(modal);
}

async function setupBiometricNow() {
    const modal = document.getElementById('biometricOfferModal');
    if (modal) modal.remove();

    const success = await registerBiometric(currentUser.mobile);
    if (success) {
        await apiCall('PATCH', `/user/${currentUser.mobile}/settings`, { biometricEnabled: true });
        currentUser.biometricEnabled = true;
        localStorage.setItem('paylance_biometric_asked_' + currentUser.mobile, '1');
        showSuccess('Biometric Enabled!', '✅ You can now login with Face ID / Fingerprint!');
        updateBiometricButton();
    }
}

function dismissBiometricOffer() {
    const modal = document.getElementById('biometricOfferModal');
    if (modal) modal.remove();
    // 7 din baad dobara poochna
    localStorage.setItem('paylance_biometric_asked_' + currentUser.mobile, '1');
    setTimeout(() => {
        localStorage.removeItem('paylance_biometric_asked_' + currentUser?.mobile);
    }, 7 * 24 * 60 * 60 * 1000);
}


// -----------------------------------------------
// INCOME / EXPENSE — transactions se calculate
// -----------------------------------------------
function updateIncomeExpenseDisplay() {
    if (!transactions || !transactions.length) return;
    const now   = new Date();
    const month = now.getMonth();
    const year  = now.getFullYear();
    let income  = 0, expense = 0;
    transactions.forEach(t => {
        const d = new Date(t.date);
        if (d.getMonth() === month && d.getFullYear() === year) {
            if (t.type === 'received') income  += t.amount;
            else                       expense += t.amount;
        }
    });
    const inc = document.getElementById('incomeDisplay');
    const exp = document.getElementById('expenseDisplay');
    if (inc) inc.textContent  = '+Rs ' + formatCurrency(income);
    if (exp) exp.textContent  = '-Rs ' + formatCurrency(expense);
}

// -----------------------------------------------
// PROFILE STATS — dynamic from real data
// -----------------------------------------------
function updateProfileStats() {
    if (!currentUser) return;
    // Transaction count
    const txEl = document.getElementById('profileTxCount');
    if (txEl) txEl.textContent = transactions.length || 0;
    // Contacts = unique recipients from sent transactions
    const uniqueContacts = new Set(
        transactions.filter(t => t.type === 'sent' && t.recipient).map(t => t.recipient)
    );
    const contactEl = document.getElementById('profileContactCount');
    if (contactEl) contactEl.textContent = uniqueContacts.size;
    // Tier based on cashbackPoints
    const tierEl = document.getElementById('profileTier');
    if (tierEl) {
        if (cashbackPoints >= 1000)     tierEl.textContent = 'Platinum';
        else if (cashbackPoints >= 500) tierEl.textContent = 'Gold';
        else if (cashbackPoints >= 100) tierEl.textContent = 'Silver';
        else                            tierEl.textContent = 'Bronze';
    }
}

// -----------------------------------------------
// LOGOUT
// -----------------------------------------------
// ✅ Naya — server ko logout call karo pehle
async function logout() {
    if (confirm('Are you sure you want to logout?')) {
        // Server se cookie clear karwao
        try {
            await fetch('/api/logout', {
                method: 'POST',
                credentials: 'include'
            });
        } catch { /* silent fail */ }

        // Local state clear karo
        currentUser = null; balance = 0; transactions = [];
        financialGoals = []; recurringPayments = []; cashbackPoints = 0;

        ['dashboard','cardsPage','profilePage','analyticsPage'].forEach(id => {
            document.getElementById(id).style.display = 'none';
        });
        document.getElementById('loginPage').style.display = 'flex';
        document.getElementById('mobileNumber').value = '';
        document.getElementById('mpin').value = '';
        // Chatbot login page par hide karo
        const cb = document.getElementById('chatbotBtn');
        if (cb) cb.style.display = 'none';
    }
}

// -----------------------------------------------
// FORGOT PIN
// -----------------------------------------------

async function processForgotPinVerify() {
    const mobile = document.getElementById('forgotMobile').value.trim();

    if (!mobile || mobile.length !== 11 || !mobile.startsWith('03')) {
        alert('❌ Please enter a valid mobile number (11 digits starting with 03)!');
        return;
    }

    try {
        const { ok, data } = await apiCall('POST', '/forgot-pin/verify', { mobile });
        if (ok) {
            forgotPinMobile = mobile;
            forgotPinEmail  = data.email;
            alert('✅ ' + data.message);
            closeModal();
            showModal('forgotPinOtp');
        } else {
            alert('❌ ' + (data.message || 'This number is not registered'));
        }
    } catch (err) {
        console.error('Forgot PIN error:', err);
        alert('❌ Error: ' + err.message);
    }
}

async function processForgotPinOtp() {
    const otp = document.getElementById('forgotOtpInput').value.trim();

    if (!otp || otp.length !== 6) {
        alert('❌ Please enter the 6-digit OTP!');
        return;
    }

    window._forgotPinOtp = otp;
    closeModal();
    showModal('resetPin');
}

async function processResetPin() {
    const newPin     = document.getElementById('resetNewPin').value.trim();
    const confirmPin = document.getElementById('resetConfirmPin').value.trim();

    if (!newPin || newPin.length !== 5)  { alert('❌ PIN must be 5 digits!'); return; }
    if (newPin !== confirmPin)           { alert('❌ PINs do not match!'); return; }
    if (/^(\d)\1{4}$/.test(newPin))     { alert('⚠️ Choose a stronger PIN!'); return; }

    // Dono flows support karo: OTP wala aur CNIC/DOB wala
    const mobile = forgotPinMobile || window._resetMobile;
    if (!mobile) { alert('❌ Session expired. Please start again.'); return; }

    try {
        let ok, data;

        if (forgotPinMobile && window._forgotPinOtp) {
            // Flow 1: OTP wala (email verify)
            ({ ok, data } = await apiCall('POST', '/forgot-pin/reset', {
                mobile: forgotPinMobile,
                email:  forgotPinEmail,
                otp:    window._forgotPinOtp,
                newPin
            }));
        } else {
            // Flow 2: CNIC/DOB wala (seedha reset)
            ({ ok, data } = await apiCall('PATCH', '/forgot-pin/direct-reset', {
                mobile,
                newPin
            }));
        }

        if (ok) {
            forgotPinMobile      = null;
            forgotPinEmail       = null;
            window._forgotPinOtp = null;
            window._resetMobile  = null;
            closeModal();
            alert('✅ PIN reset successfully! Please login with your new PIN.');
        } else {
            alert('❌ ' + (data.message || 'Failed to reset PIN'));
        }
    } catch (err) {
        alert('❌ Cannot connect to server!\n\nMake sure server is running:\nnode server.js');
    }
}

// -----------------------------------------------
// -----------------------------------------------
// BIOMETRIC — WebAuthn (Real Face ID / Fingerprint)
// -----------------------------------------------
function updateBiometricButton() {
    const btn = document.querySelector('.biometric-option');
    if (!btn) return;

    // Browser support check
    if (!window.PublicKeyCredential) {
        btn.style.opacity = '0.5';
        btn.style.cursor  = 'not-allowed';
        btn.title         = 'Biometric not supported on this browser';
        return;
    }

    // Agar mobile saved hai toh button active dikhao
    const saved = localStorage.getItem('paylance_biometric_mobile');
    if (saved) {
        btn.style.opacity = '1';
        btn.innerHTML = '<i class="fas fa-fingerprint"></i><span>Login with Biometric</span>';
    } else {
        btn.style.opacity = '0.5';
        btn.title = 'Login normally first, then enable biometric from Settings';
    }
}

// --- Helper: base64url encode/decode (WebAuthn ke liye zaroori) ---
function base64urlToBuffer(base64url) {
    const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
    const padded  = base64.padEnd(base64.length + (4 - base64.length % 4) % 4, '=');
    const binary  = atob(padded);
    return Uint8Array.from(binary, c => c.charCodeAt(0));
}

function bufferToBase64url(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary  = '';
    bytes.forEach(b => binary += String.fromCharCode(b));
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// --- BIOMETRIC LOGIN ---
async function biometricLogin() {
    if (!window.PublicKeyCredential) {
        alert('❌ Biometric not supported on this browser/device.'); return;
    }

    const savedMobile = localStorage.getItem('paylance_biometric_mobile');
    if (!savedMobile) {
        alert('🔒 No biometric setup found.\nLogin normally first, then enable biometric from Profile → Security.'); return;
    }

    const btn = document.querySelector('.biometric-option');
    btn.innerHTML = '<i class="fas fa-fingerprint fa-pulse"></i><span>Scanning...</span>';

    try {
        // Step 1: Options server se lo
        const optRes = await fetch('/api/biometric/auth-options', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ mobile: savedMobile })
        });
        const options = await optRes.json();

        if (!optRes.ok) {
            alert('❌ ' + (options.message || 'Biometric auth failed')); return;
        }

        // Step 2: Challenge + credentials prepare karo
        options.challenge = base64urlToBuffer(options.challenge);
        if (options.allowCredentials) {
            options.allowCredentials = options.allowCredentials.map(c => ({
                ...c, id: base64urlToBuffer(c.id)
            }));
        }

        // Step 3: Browser se biometric scan karwao (Face ID / Fingerprint)
        const credential = await navigator.credentials.get({ publicKey: options });

        // Step 4: Response format karo server ke liye
        const credentialJSON = {
            id:    credential.id,
            rawId: bufferToBase64url(credential.rawId),
            type:  credential.type,
            response: {
                authenticatorData: bufferToBase64url(credential.response.authenticatorData),
                clientDataJSON:    bufferToBase64url(credential.response.clientDataJSON),
                signature:         bufferToBase64url(credential.response.signature),
                userHandle:        credential.response.userHandle ? bufferToBase64url(credential.response.userHandle) : null,
            }
        };

        // Step 5: Server pe verify karo
        const verRes = await fetch('/api/biometric/auth-verify', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ mobile: savedMobile, credential: credentialJSON })
        });
        const verData = await verRes.json();

        if (verRes.ok && verData.user) {
            loadUserIntoApp(verData.user);
            showDashboard();
        } else {
            alert('❌ ' + (verData.message || 'Biometric login failed'));
        }

    } catch (err) {
        if (err.name === 'NotAllowedError') {
            alert('❌ Biometric cancelled or not allowed.');
        } else {
            console.error('Biometric login error:', err);
            alert('❌ Biometric error: ' + err.message);
        }
    } finally {
        btn.innerHTML = '<i class="fas fa-fingerprint"></i><span>Login with Biometric</span>';
    }
}

// --- BIOMETRIC REGISTER (settings se call hoga) ---
async function registerBiometric(mobile) {
    if (!window.PublicKeyCredential) {
        alert('❌ Biometric not supported on this browser/device.'); return false;
    }

    try {
        // Step 1: Registration options lo
        const optRes = await fetch('/api/biometric/register-options', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ mobile })
        });
        const options = await optRes.json();

        if (!optRes.ok) {
            alert('❌ ' + (options.message || 'Registration failed')); return false;
        }

        // Step 2: Challenge + user ID prepare karo
        options.challenge = base64urlToBuffer(options.challenge);
        options.user.id   = base64urlToBuffer(options.user.id);
        if (options.excludeCredentials) {
            options.excludeCredentials = options.excludeCredentials.map(c => ({
                ...c, id: base64urlToBuffer(c.id)
            }));
        }

        // Step 3: Biometric enroll karwao device pe
        const credential = await navigator.credentials.create({ publicKey: options });

        // Step 4: Response format karo
        const credentialJSON = {
            id:    credential.id,
            rawId: bufferToBase64url(credential.rawId),
            type:  credential.type,
            response: {
                attestationObject: bufferToBase64url(credential.response.attestationObject),
                clientDataJSON:    bufferToBase64url(credential.response.clientDataJSON),
                transports:        credential.response.getTransports ? credential.response.getTransports() : [],
            }
        };

        // Step 5: Server pe save karo
        const verRes = await fetch('/api/biometric/register-verify', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ mobile, credential: credentialJSON })
        });
        const verData = await verRes.json();

        if (verRes.ok) {
            // Mobile save karo local storage mein (next login ke liye)
            localStorage.setItem('paylance_biometric_mobile', mobile);
            updateBiometricButton();
            return true;
        } else {
            alert('❌ ' + (verData.message || 'Registration failed'));
            return false;
        }

    } catch (err) {
        if (err.name === 'NotAllowedError') {
            alert('❌ Biometric registration cancelled.');
        } else {
            console.error('Biometric register error:', err);
            alert('❌ Error: ' + err.message);
        }
        return false;
    }
}


// -----------------------------------------------
// REGISTER
// -----------------------------------------------
async function processRegister() {
    const name   = document.getElementById('regName').value.trim();
    const mobile = document.getElementById('regMobile').value.trim();
    const cnic   = document.getElementById('regCnic').value.trim();
    const email  = document.getElementById('regEmail').value.trim();
    const pin    = document.getElementById('regPin').value.trim();

    if (!name || name.length < 3)                                { alert('❌ Enter full name (min 3 chars)!'); return; }
    if (!mobile || mobile.length !== 11 || !mobile.startsWith('03')) { alert('❌ Invalid mobile number!'); return; }
    if (!cnic || cnic.length !== 13)                             { alert('❌ Invalid CNIC (13 digits)!'); return; }
    if (!email || !email.includes('@'))                          { alert('❌ Invalid email!'); return; }
    if (!pin || pin.length !== 5)                                { alert('❌ PIN must be 5 digits!'); return; }
    if (/^(\d)\1{4}$/.test(pin))                                { alert('⚠️ Choose a stronger PIN!'); return; }

    pendingRegistration = { name, mobile, cnic, email, pin };

    try {
        showSuccessAnimation('⏳ Sending OTP to your email...');
        const { ok, data } = await apiCall('POST', '/send-otp', { email });
        if (ok) { closeModal(); showOtpModal(email); }
        else    { alert('❌ Failed to send OTP: ' + (data.message || 'Unknown error')); }
    } catch { alert('❌ Server error!\n\nMake sure server is running:\nnode server.js'); }
}

function showOtpModal(email) {
    document.getElementById('otpEmailDisplay').textContent = email;
    document.getElementById('otpModal').style.display = 'flex';
    ['otp1','otp2','otp3','otp4','otp5','otp6'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('otp1').focus();
    startOtpTimer(5 * 60);
}

function closeOtpModal() {
    document.getElementById('otpModal').style.display = 'none';
    clearInterval(otpTimerInterval);
    pendingRegistration = null;
}

function otpMove(current, nextId) {
    current.value = current.value.replace(/[^0-9]/g, '');
    if (current.value.length === 1 && nextId) document.getElementById(nextId).focus();
}

function otpBack(event, prevId) {
    if (event.key === 'Backspace' && event.target.value === '' && prevId)
        document.getElementById(prevId).focus();
}

function startOtpTimer(seconds) {
    clearInterval(otpTimerInterval);
    let remaining = seconds;
    const timerEl  = document.getElementById('timerCount');
    const timerBox = document.getElementById('otpTimerBox');
    if (timerBox) timerBox.style.color = '#fdcb6e';
    otpTimerInterval = setInterval(() => {
        const m = Math.floor(remaining / 60), s = remaining % 60;
        if (timerEl) timerEl.textContent = `${m}:${s.toString().padStart(2,'0')}`;
        remaining--;
        if (remaining < 0) {
            clearInterval(otpTimerInterval);
            if (timerEl) timerEl.textContent = 'Expired';
            if (timerBox) timerBox.style.color = '#d63031';
        }
    }, 1000);
}

async function resendOtpEmail() {
    if (!pendingRegistration) return;
    try {
        const { ok } = await apiCall('POST', '/send-otp', { email: pendingRegistration.email });
        if (ok) {
            showSuccessAnimation('✅ New OTP sent to ' + pendingRegistration.email);
            startOtpTimer(5 * 60);
            ['otp1','otp2','otp3','otp4','otp5','otp6'].forEach(id => document.getElementById(id).value = '');
            document.getElementById('otp1').focus();
        } else alert('❌ Failed to resend OTP.');
    } catch { alert('❌ Server error.'); }
}

async function verifyOtpAndRegister() {
    if (!pendingRegistration) { alert('❌ Session expired. Register again.'); return; }

    const otp = ['otp1','otp2','otp3','otp4','otp5','otp6']
        .map(id => document.getElementById(id).value.trim()).join('');

    if (otp.length !== 6) { alert('❌ Enter complete 6-digit OTP!'); return; }

    try {
        const verifyResult = await apiCall('POST', '/verify-otp', {
            email: pendingRegistration.email, otp
        });

        if (!verifyResult.ok || verifyResult.data.status !== 'success') {
            alert('❌ Invalid OTP! Please try again.');
            ['otp1','otp2','otp3','otp4','otp5','otp6'].forEach(id => document.getElementById(id).value = '');
            document.getElementById('otp1').focus();
            return;
        }

        const regResult = await apiCall('POST', '/register', pendingRegistration);

        if (regResult.ok) {
            clearInterval(otpTimerInterval);
            document.getElementById('otpModal').style.display = 'none';
            const { name, mobile, pin } = pendingRegistration;
            pendingRegistration = null;
            showSuccessAnimation(`🎉 Account Created! Welcome ${name}!`);
            setTimeout(() => {
                alert(`🎉 Account Created!\n\nWelcome ${name}!\n• Mobile: ${mobile}\n• Starting Balance: Rs 25,000\n\nYou can now login!`);
                document.getElementById('mobileNumber').value = mobile;
                document.getElementById('mpin').value = pin;
            }, 1000);
        } else {
            alert('❌ ' + (regResult.data.message || 'Registration failed'));
        }
    } catch { alert('❌ Server error. Please try again.'); }
}

// -----------------------------------------------
// TRANSACTIONS
// -----------------------------------------------
async function doTransaction(type, title, recipient, amount) {
    try {
        const { ok, data } = await apiCall('POST', '/transaction', {
            mobile: currentUser.mobile, type, title, recipient, amount
        });
        if (ok) {
            balance        = data.balance;
            cashbackPoints = data.cashbackPoints;
            if (data.transaction) transactions.unshift(data.transaction);
            if (transactions.length > 50) transactions = transactions.slice(0, 50);
            updateBalanceDisplay();
            loadTransactions();
            updateCashbackDisplay();
            if (typeof showInsightsHint === 'function') showInsightsHint();
            return data; // receipt ke liye return karo
        } else {
            alert('❌ Transaction failed: ' + (data.message || 'Error'));
            return null;
        }
    } catch { alert('❌ Server error during transaction.'); return null; }
}

// ✅ Naya
async function processSendMoney() {
    const recipient = document.getElementById('recipientNumber').value.trim();
    const amount    = parseFloat(document.getElementById('sendAmount').value);
    const purpose   = document.getElementById('sendPurpose').value || 'Money Transfer';

    if (!recipient || recipient.length !== 11 || !recipient.startsWith('03')) {
        alert('❌ Invalid mobile number!'); return;
    }
    if (!amount || amount <= 0) { alert('❌ Enter valid amount!'); return; }
    if (amount > balance)       { alert('❌ Insufficient balance!'); return; }
    if (recipient === currentUser.mobile) {
        alert('❌ You cannot send money to yourself!'); return;
    }

    try {
        const { ok, data } = await apiCall('GET', `/user/verify/${recipient}`);
        if (!ok) {
            alert('❌ ' + (data.message || 'User not registered on Paylance'));
            return;
        }
        showConfirmSendModal({
            receiverName:   data.name,
            receiverMobile: data.mobile,
            amount,
            purpose
        });
    } catch {
        alert('❌ Server error. Please try again.');
    }
}


// -----------------------------------------------
// CONFIRM SEND MODAL
// -----------------------------------------------
function showConfirmSendModal({ receiverName, receiverMobile, amount, purpose }) {
    document.getElementById('modalTitle').textContent = 'Confirm Transfer';
    document.getElementById('modalBody').innerHTML = `
        <div style="text-align:center;padding:10px 0 20px">
            <div style="width:70px;height:70px;border-radius:50%;
                        background:linear-gradient(135deg,#6C5CE7,#A29BFE);
                        display:inline-flex;align-items:center;justify-content:center;
                        font-size:28px;color:#fff;margin-bottom:12px">
                <i class="fas fa-user"></i>
            </div>
            <h3 style="color:#2d3436;margin:0">${receiverName}</h3>
            <p style="color:#636e72;font-size:13px;margin:4px 0 0">${receiverMobile}</p>
        </div>
        <div style="background:#f8f9fa;border-radius:14px;padding:16px;margin-bottom:16px">
            <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #eee">
                <span style="color:#999;font-size:13px">From</span>
                <span style="font-weight:600;font-size:13px">${currentUser.name}</span>
            </div>
            <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #eee">
                <span style="color:#999;font-size:13px">To</span>
                <span style="font-weight:600;font-size:13px">${receiverName}</span>
            </div>
            <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #eee">
                <span style="color:#999;font-size:13px">Amount</span>
                <span style="font-weight:700;font-size:16px;color:#6C5CE7">Rs ${formatCurrency(amount)}</span>
            </div>
            <div style="display:flex;justify-content:space-between;padding:8px 0">
                <span style="color:#999;font-size:13px">Purpose</span>
                <span style="font-weight:600;font-size:13px">${purpose}</span>
            </div>
        </div>
        <button class="btn-submit" onclick="confirmAndSend('${receiverMobile}', '${receiverName}', ${amount}, '${purpose}')">
            <i class="fas fa-paper-plane"></i> Confirm & Send
        </button>
        <button class="btn-cancel" onclick="closeModal()">Cancel</button>
    `;
    document.getElementById('transactionModal').style.display = 'flex';
}

// -----------------------------------------------
// CONFIRM AND SEND
// -----------------------------------------------
async function confirmAndSend(receiverMobile, receiverName, amount, purpose) {
    const data = await doTransaction('sent', purpose, receiverMobile, amount);
    if (data) {
        closeModal();
        showReceiptModal({
            type:         'sent',
            title:        purpose,
            recipient:    receiverMobile,
            receiverName: receiverName,
            senderName:   currentUser.name,
            amount,
            balance:      data.balance,
            date:         new Date().toLocaleString(),
            txnId:        data.transaction?._id || generateTxnId()
        });
    }
}

async function processAddMoney() {
    const method = document.getElementById('addMethod').value;
    const amount = parseFloat(document.getElementById('addAmount').value);
    if (!amount || amount <= 0) { alert('❌ Enter valid amount!'); return; }
    try {
        const { ok, data } = await apiCall('PATCH', `/user/${currentUser.mobile}/balance`, { amount, method });
        if (ok) {
            balance = data.balance;
            if (data.transaction) transactions.unshift(data.transaction);
            updateBalanceDisplay();
            loadTransactions();
            closeModal();
            showReceiptModal({
                type: 'received', title: `Added via ${method}`, recipient: 'Paylance Account',
                amount, balance: data.balance, date: new Date().toLocaleString(),
                txnId: data.transaction?._id || generateTxnId()
            });
        } else {
            alert('❌ ' + (data.message || 'Failed to add money'));
        }
    } catch { alert('❌ Server error.'); }
}

async function processMobileLoad() {
    const number = document.getElementById('loadNumber').value.trim();
    const amount = parseFloat(document.getElementById('loadPackage').value);
    if (!number || number.length !== 11 || !number.startsWith('03')) { alert('❌ Invalid mobile number!'); return; }
    if (amount > balance) { alert('❌ Insufficient balance!'); return; }
    const data = await doTransaction('bill', 'Mobile Recharge', number, amount);
    if (data) {
        closeModal();
        showReceiptModal({
            type: 'bill', title: 'Mobile Recharge', recipient: number,
            amount, balance: data.balance, date: new Date().toLocaleString(),
            txnId: data.transaction?._id || generateTxnId()
        });
    }
}

async function processBillPayment() {
    const billType       = document.getElementById('billType').value;
    const consumerNumber = document.getElementById('consumerNumber').value.trim();
    const amount         = parseFloat(document.getElementById('billAmount').value);
    if (!consumerNumber) { alert('❌ Enter consumer number!'); return; }
    if (!amount || amount <= 0) { alert('❌ Enter valid amount!'); return; }
    if (amount > balance)       { alert('❌ Insufficient balance!'); return; }
    const data = await doTransaction('bill', `${billType} Bill`, consumerNumber, amount);
    if (data) {
        closeModal();
        showReceiptModal({
            type: 'bill', title: `${billType} Bill`, recipient: consumerNumber,
            amount, balance: data.balance, date: new Date().toLocaleString(),
            txnId: data.transaction?._id || generateTxnId()
        });
    }
}

function processRequestMoney() {
    const number = document.getElementById('requestNumber').value.trim();
    const amount = parseFloat(document.getElementById('requestAmount').value);
    if (!number || number.length !== 11 || !number.startsWith('03')) { alert('❌ Invalid mobile!'); return; }
    if (!amount || amount <= 0) { alert('❌ Enter valid amount!'); return; }
    closeModal();
    showSuccessAnimation(`Request for Rs ${formatCurrency(amount)} sent to ${number}`);
}

// -----------------------------------------------
// BALANCE
// -----------------------------------------------
function updateBalanceDisplay() {
    const el = document.getElementById('balance');
    if (el && balanceVisible) el.textContent = formatCurrency(balance);
}

function toggleBalance() {
    const el   = document.getElementById('balance');
    const icon = document.querySelector('.balance-toggle');
    balanceVisible = !balanceVisible;
    if (balanceVisible) {
        if (el) el.textContent = formatCurrency(balance);
        icon && icon.classList.replace('fa-eye-slash','fa-eye');
    } else {
        if (el) el.textContent = '****';
        icon && icon.classList.replace('fa-eye','fa-eye-slash');
    }
}

function formatCurrency(amount) { return Number(amount).toLocaleString('en-PK'); }

// -----------------------------------------------
// TRANSACTION LIST
// -----------------------------------------------
function loadTransactions() {
    const list = document.getElementById('transactionList');
    if (!list) return;
    if (!transactions || transactions.length === 0) {
        list.innerHTML = `<div class="empty-state">
            <i class="fas fa-receipt"></i><p>No transactions yet</p>
            <span>Start your first transaction</span></div>`;
        return;
    }
    list.innerHTML = transactions.slice(0, 5).map(t => {
        const iconClass   = t.type === 'received' ? 'received' : t.type === 'sent' ? 'sent' : 'bill';
        const icon        = t.type === 'received' ? 'fa-arrow-down' : t.type === 'sent' ? 'fa-arrow-up' : 'fa-file-invoice';
        const amountClass = t.type === 'received' ? 'credit' : 'debit';
        const amountSign  = t.type === 'received' ? '+' : '-';
        return `<div class="transaction-item">
            <div class="transaction-icon ${iconClass}"><i class="fas ${icon}"></i></div>
            <div class="transaction-details">
                <div class="transaction-title">${t.title}</div>
                <div class="transaction-date">${t.date ? new Date(t.date).toLocaleString() : ''}</div>
            </div>
            <div class="transaction-amount ${amountClass}">${amountSign}Rs ${formatCurrency(t.amount)}</div>
        </div>`;
    }).join('');
    // Update all dynamic displays after loading transactions
    onTransactionsLoaded();
}

// -----------------------------------------------
// PROFILE
// -----------------------------------------------
function updateProfileDisplay() {
    if (!currentUser) return;
    const nameEl  = document.getElementById('profileName');
    const phoneEl = document.getElementById('profilePhone');
    if (nameEl)  nameEl.textContent  = currentUser.name;
    if (phoneEl) phoneEl.textContent = formatPhoneNumber(currentUser.mobile);
    const txCountEl = document.querySelector('.profile-stats .stat-box:first-child .stat-number');
    if (txCountEl) txCountEl.textContent = transactions.length;
}

function updateCardHolderNames() {
    if (!currentUser) return;
    document.querySelectorAll('.card-holder-name').forEach(el => {
        el.textContent = currentUser.name.toUpperCase();
    });
}

function formatPhoneNumber(mobile) {
    if (mobile && mobile.startsWith('03'))
        return '+92 ' + mobile.substring(1,4) + ' ' + mobile.substring(4);
    return mobile;
}

async function updatePersonalInfo() {
    const fullName = document.getElementById('fullName').value.trim();
    const email    = document.getElementById('email').value.trim();
    if (!fullName || fullName.length < 3) { alert('❌ Enter valid name!'); return; }
    if (!email || !email.includes('@'))   { alert('❌ Enter valid email!'); return; }
    try {
        const { ok, data } = await apiCall('PATCH', `/user/${currentUser.mobile}/profile`, { name: fullName, email });
        if (ok) {
            currentUser.name = fullName; currentUser.email = email;
            const el = document.getElementById('userName');
            if (el) el.textContent = fullName;
            updateProfileDisplay();
            closeModal();
            showSuccessAnimation('✅ Profile updated!');
        } else alert('❌ ' + (data.message || 'Update failed'));
    } catch { alert('❌ Server error.'); }
}

// -----------------------------------------------
// SECURITY
// -----------------------------------------------
async function updateSecurity() {
    const currentPin = document.getElementById('currentPin').value;
    const newPin     = document.getElementById('newPin').value;
    const confirmPin = document.getElementById('confirmPin').value;

    if (currentPin && newPin && confirmPin) {
        if (newPin.length !== 5)   { alert('❌ New PIN must be 5 digits!'); return; }
        if (newPin === currentPin)  { alert('❌ New PIN must differ from current!'); return; }
        if (newPin !== confirmPin)  { alert('❌ PINs do not match!'); return; }
        try {
            const { ok, data } = await apiCall('PATCH', `/user/${currentUser.mobile}/pin`, { currentPin, newPin });
            if (ok) { closeModal(); showSuccessAnimation('✅ PIN changed!'); }
            else     alert('❌ ' + (data.message || 'PIN change failed'));
        } catch { alert('❌ Server error.'); }
    } else if (currentPin || newPin || confirmPin) {
        alert('⚠️ Fill all PIN fields to change PIN');
    } else {
        closeModal(); showSuccessAnimation('✅ Security settings saved!');
    }
}

async function toggleBiometric(checkbox) {
    const enabled = checkbox.checked;

    if (enabled) {
        if (!confirm('🔐 Enable Biometric Login?\n\nYour device\'s Face ID or Fingerprint will be used.')) {
            checkbox.checked = false; return;
        }

        // Real WebAuthn registration
        const success = await registerBiometric(currentUser.mobile);

        if (success) {
            await apiCall('PATCH', `/user/${currentUser.mobile}/settings`, { biometricEnabled: true });
            currentUser.biometricEnabled = true;
            showSuccess('Biometric Enabled!', '✅ Face ID / Fingerprint login is now active.');
        } else {
            checkbox.checked = false;
        }

    } else {
        if (!confirm('⚠️ Disable Biometric Login?')) { checkbox.checked = true; return; }

        try {
            // Server pe disable karo
            await fetch('/api/biometric/disable', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ mobile: currentUser.mobile })
            });
            await apiCall('PATCH', `/user/${currentUser.mobile}/settings`, { biometricEnabled: false });
            currentUser.biometricEnabled = false;

            // Local storage se bhi hatao
            localStorage.removeItem('paylance_biometric_mobile');
            updateBiometricButton();

            alert('🔓 Biometric Disabled');
        } catch {
            alert('❌ Server error.');
            checkbox.checked = true;
        }
    }
}


async function toggle2FA(checkbox) {
    const enabled = checkbox.checked;
    if (enabled) {
        if (!confirm('📱 Enable Two-Factor Authentication?')) { checkbox.checked = false; return; }
    } else {
        if (!confirm('⚠️ Disable Two-Factor Authentication?')) { checkbox.checked = true; return; }
    }
    try {
        await apiCall('PATCH', `/user/${currentUser.mobile}/settings`, { twoFactorEnabled: enabled });
        currentUser.twoFactorEnabled = enabled;
        alert(enabled ? '✅ 2FA Enabled!' : '🔓 2FA Disabled');
    } catch { alert('❌ Server error.'); }
}

// -----------------------------------------------
// BUDGET
// -----------------------------------------------
async function updateBudget() {
    const newBudget = parseFloat(document.getElementById('monthlyBudgetInput').value);
    if (!newBudget || newBudget <= 0) { alert('❌ Enter valid budget!'); return; }
    try {
        await apiCall('PATCH', `/user/${currentUser.mobile}/settings`, { monthlyBudget: newBudget });
        monthlyBudget = newBudget;
        closeModal(); updateBudgetDisplay(); showSuccessAnimation('✅ Budget updated!');
    } catch { alert('❌ Server error.'); }
}

function calculateMonthlySpent() {
    const now = new Date();
    return transactions.filter(t => {
        const d = new Date(t.date);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
            && (t.type === 'sent' || t.type === 'bill');
    }).reduce((sum, t) => sum + t.amount, 0);
}

function updateBudgetDisplay() {
    const spent = calculateMonthlySpent();
    const pct   = (spent / monthlyBudget) * 100;
    const spentEl = document.getElementById('monthlySpent');
    const fillEl  = document.getElementById('budgetFill');
    const limitEl = document.getElementById('budgetLimit');
    if (spentEl) spentEl.textContent = `Rs ${formatCurrency(spent)}`;
    if (limitEl) limitEl.textContent = formatCurrency(monthlyBudget);
    if (fillEl) {
        fillEl.style.width = `${Math.min(pct, 100)}%`;
        if (pct > 90) fillEl.style.background = 'linear-gradient(135deg, var(--danger), #FF7675)';
        else if (pct > 70) fillEl.style.background = 'linear-gradient(135deg, var(--warning), #FFEAA7)';
    }
}

// -----------------------------------------------
// GOALS
// -----------------------------------------------
async function addFinancialGoal() {
    const name    = document.getElementById('goalName').value.trim();
    const target  = parseFloat(document.getElementById('goalTarget').value);
    const current = parseFloat(document.getElementById('goalCurrent').value) || 0;
    const date    = document.getElementById('goalDate').value;
    if (!name || !target || !date) { alert('❌ Fill all fields!'); return; }
    try {
        const { ok, data } = await apiCall('POST', `/user/${currentUser.mobile}/goals`, { name, target, current, date });
        if (ok) {
            financialGoals = data.goals;
            closeModal(); updateGoalsDisplay(); showSuccessAnimation('✅ Goal added!');
        } else alert('❌ ' + (data.message || 'Failed'));
    } catch { alert('❌ Server error.'); }
}

function updateGoalsDisplay() {
    const list = document.getElementById('goalsList');
    if (!list) return;
    if (financialGoals.length === 0) {
        list.innerHTML = `<div class="empty-state">
            <i class="fas fa-bullseye"></i><p>No goals yet</p>
            <span>Set your first financial goal</span></div>`;
        return;
    }
    list.innerHTML = financialGoals.map(goal => {
        const pct = (goal.current / goal.target) * 100;
        const id  = goal._id || goal.id;
        return `<div class="goal-card" onclick="showGoalDetails('${id}')">
            <div class="goal-header">
                <span class="goal-title">${goal.name}</span>
                <span class="goal-amount">Rs ${formatCurrency(goal.current)} / ${formatCurrency(goal.target)}</span>
            </div>
            <div class="goal-progress-bar">
                <div class="goal-progress-fill" style="width:${pct}%"></div>
            </div>
            <div class="goal-footer">
                <span>${Math.round(pct)}% Complete</span>
                <span>Target: ${new Date(goal.date).toLocaleDateString()}</span>
            </div>
        </div>`;
    }).join('');
}

function showGoalDetails(goalId) {
    const goal = financialGoals.find(g => (g._id || g.id) == goalId);
    if (!goal) return;
    document.getElementById('modalTitle').textContent = goal.name;
    document.getElementById('modalBody').innerHTML = `
        <div style="text-align:center;padding:20px">
            <i class="fas fa-bullseye" style="font-size:60px;color:var(--primary);margin-bottom:20px"></i>
            <div style="background:#f8f9fa;padding:20px;border-radius:15px;margin:20px 0">
                <h3 style="color:var(--primary)">Rs ${formatCurrency(goal.current)}</h3>
                <p style="color:#666">of Rs ${formatCurrency(goal.target)}</p>
            </div>
            <div class="form-group"><label>Add to Goal (Rs)</label>
                <input type="number" id="goalAddAmount" placeholder="Enter amount"></div>
        </div>
        <button class="btn-submit" onclick="addToGoal('${goalId}')">
            <i class="fas fa-plus"></i> Add Money</button>
        <button class="btn-cancel" onclick="deleteGoal('${goalId}')" style="background:var(--danger)">
            <i class="fas fa-trash"></i> Delete</button>
        <button class="btn-cancel" onclick="closeModal()">Close</button>`;
    document.getElementById('transactionModal').style.display = 'flex';
}

async function addToGoal(goalId) {
    const amount = parseFloat(document.getElementById('goalAddAmount').value);
    if (!amount || amount <= 0) { alert('❌ Enter valid amount!'); return; }
    try {
        const { ok, data } = await apiCall('PATCH', `/user/${currentUser.mobile}/goals/${goalId}`, { amount });
        if (ok) {
            financialGoals = data.goals;
            closeModal(); updateGoalsDisplay(); showSuccessAnimation(`✅ Added Rs ${amount}!`);
        }
    } catch { alert('❌ Server error.'); }
}

async function deleteGoal(goalId) {
    if (!confirm('Delete this goal?')) return;
    try {
        const { ok, data } = await apiCall('DELETE', `/user/${currentUser.mobile}/goals/${goalId}`);
        if (ok) {
            financialGoals = data.goals;
            closeModal(); updateGoalsDisplay(); showSuccessAnimation('Goal deleted');
        }
    } catch { alert('❌ Server error.'); }
}

// -----------------------------------------------
// CASHBACK
// -----------------------------------------------
function updateCashbackDisplay() {
    const el = document.getElementById('cashbackPoints');
    if (el) el.textContent = `${cashbackPoints} Points`;
}

async function redeemCashback() {
    if (cashbackPoints < 100) { alert('❌ Need at least 100 points!'); return; }
    try {
        const { ok, data } = await apiCall('POST', `/user/${currentUser.mobile}/redeem`);
        if (ok) {
            balance = data.balance; cashbackPoints = data.cashbackPoints;
            updateBalanceDisplay(); updateCashbackDisplay();
            closeModal(); showSuccessAnimation(`🎉 ${data.message}`);
        } else alert('❌ ' + (data.message || 'Redeem failed'));
    } catch { alert('❌ Server error.'); }
}

// -----------------------------------------------
// RECURRING
// -----------------------------------------------
async function addRecurringPayment() {
    const title     = document.getElementById('recurringTitle').value.trim();
    const amount    = parseFloat(document.getElementById('recurringAmount').value);
    const frequency = document.getElementById('recurringFrequency').value;
    const date      = document.getElementById('recurringDate').value;
    if (!title || !amount || !date) { alert('❌ Fill all fields!'); return; }
    try {
        const { ok, data } = await apiCall('POST', `/user/${currentUser.mobile}/recurring`, {
            title, amount, schedule: frequency, date
        });
        if (ok) {
            recurringPayments = data.recurringPayments;
            closeModal(); showSuccessAnimation('✅ Recurring payment added!');
            setTimeout(() => showModal('recurringPayments'), 500);
        }
    } catch { alert('❌ Server error.'); }
}

async function toggleRecurring(index) {
    const payment = recurringPayments[index];
    const payId   = payment._id || payment.id;
    try {
        const { ok, data } = await apiCall('PATCH', `/user/${currentUser.mobile}/recurring/${payId}`);
        if (ok) {
            recurringPayments = data.recurringPayments;
            showSuccessAnimation(recurringPayments[index].active ? 'Payment activated' : 'Payment paused');
        }
    } catch { alert('❌ Server error.'); }
}

// -----------------------------------------------
// FORGOT / RESET PIN
// (processResetPin is defined earlier — uses POST /forgot-pin/reset with OTP verification)
// -----------------------------------------------
async function processForgotPin() {
    const mobile = document.getElementById('forgotMobile').value.trim();
    const cnic   = document.getElementById('forgotCnic').value.trim();
    const dob    = document.getElementById('forgotDob').value;
    if (!mobile || mobile.length !== 11 || !mobile.startsWith('03')) { alert('❌ Invalid mobile!'); return; }
    if (!cnic || cnic.length !== 13) { alert('❌ Invalid CNIC!'); return; }
    if (!dob) { alert('❌ Select date of birth!'); return; }
    window._resetMobile = mobile;
    closeModal();
    showSuccessAnimation('⏳ Verifying your information...');
    setTimeout(() => showModal('resetPin'), 2000);
}

// -----------------------------------------------
// MISC
// -----------------------------------------------
function processSplitBill() {
    const amount      = parseFloat(document.getElementById('splitAmount').value);
    const people      = parseInt(document.getElementById('splitPeople').value);
    const description = document.getElementById('splitDescription').value;
    if (!amount || amount <= 0) { alert('❌ Enter valid amount!'); return; }
    if (!people || people < 2)  { alert('❌ Enter at least 2 people!'); return; }
    const perPerson = (amount / people).toFixed(2);
    closeModal();
    document.getElementById('modalTitle').textContent = 'Bill Split Result';
    document.getElementById('modalBody').innerHTML = `
        <div style="text-align:center;padding:20px">
            <i class="fas fa-check-circle" style="font-size:60px;color:var(--success);margin-bottom:20px"></i>
            <h3>${description || 'Bill Split'}</h3>
            <p style="color:#666">Total: Rs ${amount}</p>
            <div style="background:#f8f9fa;padding:20px;border-radius:15px;margin:20px 0">
                <h2 style="color:var(--primary)">Rs ${perPerson}</h2>
                <p style="color:#666">per person (${people} people)</p>
            </div>
        </div>
        <button class="btn-submit" onclick="closeModal()">Done</button>`;
    document.getElementById('transactionModal').style.display = 'flex';
}

function convertCurrency() {
    const amount   = parseFloat(document.getElementById('convertAmount').value);
    const currency = document.getElementById('convertTo').value;
    const rates = { USD:0.0036,EUR:0.0033,GBP:0.0028,AED:0.013,SAR:0.013,INR:0.30 };
    const rate  = rates[currency];
    const el    = document.getElementById('converterResult');
    if (!amount || amount <= 0) {
        el.innerHTML = '<div class="converter-amount">0.00</div><div class="converter-rate">Enter amount</div>'; return;
    }
    el.innerHTML = `<div class="converter-amount">${(amount*rate).toFixed(2)} ${currency}</div>
        <div class="converter-rate">1 PKR = ${rate} ${currency}</div>`;
}

function filterTransactions() {
    const query    = document.getElementById('searchQuery').value.toLowerCase();
    const type     = document.getElementById('filterType').value;
    const dateFrom = document.getElementById('filterDateFrom').value;
    const dateTo   = document.getElementById('filterDateTo').value;
    let filtered   = transactions;
    if (type !== 'all') filtered = filtered.filter(t => t.type === type);
    if (query) filtered = filtered.filter(t => t.title.toLowerCase().includes(query) || t.amount.toString().includes(query));
    if (dateFrom) filtered = filtered.filter(t => new Date(t.date) >= new Date(dateFrom));
    if (dateTo)   filtered = filtered.filter(t => new Date(t.date) <= new Date(dateTo));
    const container = document.getElementById('filteredTransactions');
    if (filtered.length === 0) {
        container.innerHTML = `<div class="empty-state"><i class="fas fa-search"></i><p>No transactions found</p></div>`; return;
    }
    container.innerHTML = filtered.map(t => {
        const iconClass = t.type==='received'?'received':t.type==='sent'?'sent':'bill';
        const icon = t.type==='received'?'fa-arrow-down':t.type==='sent'?'fa-arrow-up':'fa-file-invoice';
        const amountClass = t.type==='received'?'credit':'debit';
        const amountSign  = t.type==='received'?'+':'-';
        return `<div class="transaction-item">
            <div class="transaction-icon ${iconClass}"><i class="fas ${icon}"></i></div>
            <div class="transaction-details">
                <div class="transaction-title">${t.title}</div>
                <div class="transaction-date">${new Date(t.date).toLocaleString()}</div>
            </div>
            <div class="transaction-amount ${amountClass}">${amountSign}Rs ${formatCurrency(t.amount)}</div>
        </div>`;
    }).join('');
}

// -----------------------------------------------
// UI
// -----------------------------------------------
function updateGreeting() {
    const hour = new Date().getHours();
    const el   = document.querySelector('.greeting');
    if (el) el.textContent = hour < 12 ? 'Good Morning' : hour < 18 ? 'Good Afternoon' : 'Good Evening';
}

function togglePassword() {
    const input = document.getElementById('mpin');
    const icon  = document.querySelector('.toggle-password');
    if (input.type === 'password') { input.type = 'text'; icon && icon.classList.replace('fa-eye','fa-eye-slash'); }
    else { input.type = 'password'; icon && icon.classList.replace('fa-eye-slash','fa-eye'); }
}

function showSuccessAnimation(message) {
    const popup = document.getElementById('successPopup');
    const msgEl = document.getElementById('successMessage');
    if (!popup || !msgEl) return;
    msgEl.textContent = message;
    popup.style.display = 'flex';
    setTimeout(() => popup.style.display = 'none', 3000);
}

// -----------------------------------------------
// RECEIPT
// -----------------------------------------------
function generateTxnId() {
    return 'TXN' + Date.now().toString().slice(-10).toUpperCase();
}

function showReceiptModal(txn) {
    const typeLabel = txn.type === 'sent' ? 'Money Sent' : txn.type === 'received' ? 'Money Received' : 'Bill Payment';
    const typeColor = txn.type === 'received' ? '#00b894' : '#d63031';
    const typeIcon  = txn.type === 'received' ? '↓' : txn.type === 'sent' ? '↑' : '📄';
    const recipientLabel = txn.type === 'sent' ? 'Sent To' : txn.type === 'received' ? 'Source' : 'Consumer No.';

    document.getElementById('modalTitle').textContent = 'Transaction Receipt';
    document.getElementById('modalBody').innerHTML = `
        <div id="receiptContent" style="font-family:Arial,sans-serif;padding:10px">
            <div style="text-align:center;padding:20px 0 15px">
                <div style="width:60px;height:60px;border-radius:50%;background:${typeColor};display:inline-flex;align-items:center;justify-content:center;font-size:26px;color:#fff;margin-bottom:10px">${typeIcon}</div>
                <div style="font-size:22px;font-weight:700;color:${typeColor}">Rs ${formatCurrency(txn.amount)}</div>
                <div style="color:#666;font-size:13px;margin-top:4px">${typeLabel}</div>
            </div>

            <div style="background:#f8f9fa;border-radius:12px;padding:16px;margin-bottom:12px">
                <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #eee">
                    <span style="color:#999;font-size:13px">Transaction ID</span>
                    <span style="font-weight:600;font-size:12px;color:#333">${txn.txnId}</span>
                </div>
                <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #eee">
                    <span style="color:#999;font-size:13px">Date & Time</span>
                    <span style="font-weight:600;font-size:12px;color:#333">${txn.date}</span>
                </div>
                <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #eee">
                    <span style="color:#999;font-size:13px">Description</span>
                    <span style="font-weight:600;font-size:13px;color:#333">${txn.title}</span>
                </div>

                <!-- ✅ Recipient row — naam bhi dikhao -->
                <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #eee">
                    <span style="color:#999;font-size:13px">${recipientLabel}</span>
                    <span style="font-weight:600;font-size:13px;color:#333">
                        ${txn.receiverName ? txn.receiverName + ' (' + txn.recipient + ')' : txn.recipient || '—'}
                    </span>
                </div>

                <!-- ✅ From row — sender naam bhi dikhao -->
                <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #eee">
                    <span style="color:#999;font-size:13px">From</span>
                    <span style="font-weight:600;font-size:13px;color:#333">
                        ${txn.senderName || currentUser.name} (${currentUser.mobile})
                    </span>
                </div>

                <div style="display:flex;justify-content:space-between;padding:8px 0">
                    <span style="color:#999;font-size:13px">Remaining Balance</span>
                    <span style="font-weight:700;font-size:14px;color:#333">Rs ${formatCurrency(txn.balance)}</span>
                </div>
            </div>

            <div style="text-align:center;background:linear-gradient(135deg,#667EEA,#764BA2);border-radius:10px;padding:10px;margin-bottom:12px">
                <div style="color:#fff;font-size:16px;font-weight:700">Paylance</div>
                <div style="color:rgba(255,255,255,0.8);font-size:11px">Professional Digital Banking</div>
            </div>

            <div style="text-align:center;color:#aaa;font-size:11px">
                This is an electronically generated receipt.<br>No signature required.
            </div>
        </div>

        <button class="btn-submit" onclick="downloadReceipt('${txn.txnId}')" style="margin-top:15px">
            <i class="fas fa-download"></i> Download Receipt
        </button>
        <button class="btn-cancel" onclick="closeModal()">Close</button>
    `;
    document.getElementById('transactionModal').style.display = 'flex';
}

function downloadReceipt(txnId) {
    const content = document.getElementById('receiptContent');
    if (!content) return;

    const printWindow = window.open('', '_blank', 'width=420,height=700');
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>Paylance Receipt - ${txnId}</title>
            <style>
                * { margin:0; padding:0; box-sizing:border-box; }
                body { font-family: Arial, sans-serif; background: #fff; padding: 20px; }
                @media print {
                    body { padding: 0; }
                    .no-print { display: none; }
                }
            </style>
        </head>
        <body>
            ${content.innerHTML}
            <script>
                window.onload = function() {
                    window.print();
                    setTimeout(() => window.close(), 500);
                };
            <\/script>
        </body>
        </html>
    `);
    printWindow.document.close();
}

function showNotifications() {
    // Build real notifications from recent transactions
    const recentTx = transactions.slice(0, 5);
    const modal    = document.getElementById('transactionModal');
    document.getElementById('modalTitle').textContent = '🔔 Notifications';
    let content = '<div style="max-height:400px;overflow-y:auto">';
    if (!recentTx.length) {
        content += '<div class="empty-state"><i class="fas fa-bell-slash"></i><p>No notifications</p></div>';
    } else {
        recentTx.forEach(t => {
            const icon  = t.type === 'received' ? '💰' : t.type === 'bill' ? '📋' : '💸';
            const color = t.type === 'received' ? '#00b894' : '#e17055';
            const date  = new Date(t.date).toLocaleDateString('en-PK');
            content += `<div style="display:flex;align-items:center;gap:12px;padding:14px;border-bottom:1px solid #f0f0f0">
                <span style="font-size:24px">${icon}</span>
                <div style="flex:1">
                    <div style="font-weight:600;font-size:14px">${t.title}</div>
                    <div style="font-size:12px;color:#999">${date}</div>
                </div>
                <div style="font-weight:700;color:${color}">
                    ${t.type === 'received' ? '+' : '-'}Rs ${formatCurrency(t.amount)}
                </div>
            </div>`;
        });
    }
    content += '</div><button class="btn-cancel" onclick="closeModal()" style="margin-top:12px">Close</button>';
    document.getElementById('modalBody').innerHTML = content;
    modal.style.display = 'flex';
    // Update badge
    const badge = document.querySelector('.notification-badge');
    if (badge) badge.style.display = 'none';
}
function showQRCode() {
    const modal = document.getElementById('transactionModal');
    document.getElementById('modalTitle').textContent = '📱 My QR Code';
    const mobile = currentUser?.mobile || '';
    const name   = currentUser?.name   || '';
    // Generate QR using free API
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=paylance:${mobile}`;
    document.getElementById('modalBody').innerHTML = `
        <div style="text-align:center;padding:20px">
            <img src="${qrUrl}" alt="QR Code" style="border-radius:12px;border:4px solid #6c5ce7;width:200px;height:200px">
            <div style="margin-top:16px;font-weight:700;font-size:16px">${name}</div>
            <div style="color:#999;font-size:13px;margin-top:4px">${mobile}</div>
            <div style="background:#f8f9fa;padding:12px;border-radius:10px;margin-top:16px;font-size:12px;color:#666">
                📷 Someone can scan this to send you money
            </div>
        </div>
        <button class="btn-cancel" onclick="closeModal()">Close</button>`;
    modal.style.display = 'flex';
}
function showProfile() { showPage('profile'); }

function showPage(pageName) {
    ['dashboard','cardsPage','profilePage','analyticsPage'].forEach(id => {
        document.getElementById(id).style.display = 'none';
    });
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    switch (pageName) {
        case 'home':      document.getElementById('dashboard').style.display    = 'block'; document.getElementById('navHome')?.classList.add('active'); break;
        case 'analytics': document.getElementById('analyticsPage').style.display = 'block'; document.getElementById('navAnalytics')?.classList.add('active'); updateAnalyticsDisplay('month'); break;
        case 'cards':     document.getElementById('cardsPage').style.display     = 'block'; document.getElementById('navCards')?.classList.add('active'); updateCardHolderNames(); loadCards(); break;
        case 'profile':   document.getElementById('profilePage').style.display   = 'block'; document.getElementById('navProfile')?.classList.add('active'); updateProfileDisplay(); updateProfileStats(); updateProfileUI(); break;
    }
}

function changePeriod(period) {
    document.querySelectorAll('.period-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    updateAnalyticsDisplay(period);
}

function updateAnalyticsDisplay(period = 'month') {
    if (!transactions || !transactions.length) return;
    const now  = new Date();
    let filtered;
    if (period === 'week') {
        const weekAgo = new Date(now - 7*24*60*60*1000);
        filtered = transactions.filter(t => new Date(t.date) >= weekAgo);
    } else if (period === 'year') {
        filtered = transactions.filter(t => new Date(t.date).getFullYear() === now.getFullYear());
    } else {
        filtered = transactions.filter(t => {
            const d = new Date(t.date);
            return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        });
    }
    let income = 0, expense = 0;
    const cats = { Shopping:0, Food:0, Transport:0, Bills:0, Entertainment:0, Others:0 };
    filtered.forEach(t => {
        if (t.type === 'received') { income += t.amount; return; }
        expense += t.amount;
        const title = (t.title||'').toLowerCase();
        if (title.includes('shop') || title.includes('amazon') || title.includes('store')) cats.Shopping += t.amount;
        else if (title.includes('food') || title.includes('eat') || title.includes('restaurant') || title.includes('cafe')) cats.Food += t.amount;
        else if (title.includes('transport') || title.includes('uber') || title.includes('fuel') || title.includes('petrol')) cats.Transport += t.amount;
        else if (title.includes('bill') || title.includes('electric') || title.includes('gas') || title.includes('water') || title.includes('internet')) cats.Bills += t.amount;
        else if (title.includes('entertain') || title.includes('movie') || title.includes('netflix')) cats.Entertainment += t.amount;
        else cats.Others += t.amount;
    });
    // Update summary amounts
    const incEl = document.querySelector('.income-card .summary-amount');
    const expEl = document.querySelector('.expense-card .summary-amount');
    if (incEl) incEl.textContent = 'Rs ' + formatCurrency(income);
    if (expEl) expEl.textContent = 'Rs ' + formatCurrency(expense);
    // Update category breakdown
    const catList = document.querySelector('.category-list');
    if (!catList) return;
    const total = Object.values(cats).reduce((a,b) => a+b, 0) || 1;
    const catColors = {
        Shopping:'linear-gradient(135deg,#667EEA,#764BA2)',
        Food:'linear-gradient(135deg,#F093FB,#F5576C)',
        Transport:'linear-gradient(135deg,#4FACFE,#00F2FE)',
        Bills:'linear-gradient(135deg,#43E97B,#38F9D7)',
        Entertainment:'linear-gradient(135deg,#FA709A,#FEE140)',
        Others:'linear-gradient(135deg,#30CFD0,#330867)'
    };
    const catIcons = {
        Shopping:'fa-shopping-cart', Food:'fa-utensils', Transport:'fa-car',
        Bills:'fa-file-invoice', Entertainment:'fa-film', Others:'fa-ellipsis-h'
    };
    catList.innerHTML = Object.keys(cats).map(cat => {
        const pct = Math.round((cats[cat]/total)*100);
        return `<div class="category-item">
            <div class="category-info">
                <div class="category-icon" style="background:${catColors[cat]}">
                    <i class="fas ${catIcons[cat]}"></i>
                </div>
                <div class="category-details">
                    <span class="category-name">${cat}</span>
                    <span class="category-amount">Rs ${formatCurrency(cats[cat])}</span>
                </div>
            </div>
            <div class="category-progress">
                <div class="progress-bar">
                    <div class="progress-fill" style="width:${pct}%;background:${catColors[cat]}"></div>
                </div>
                <span class="category-percent">${pct}%</span>
            </div>
        </div>`;
    }).join('');
    // Top merchants from real transactions
    const merchantMap = {};
    filtered.filter(t => t.type !== 'received').forEach(t => {
        const key = t.title || 'Others';
        if (!merchantMap[key]) merchantMap[key] = { count:0, amount:0 };
        merchantMap[key].count++;
        merchantMap[key].amount += t.amount;
    });
    const topMerchants = Object.entries(merchantMap).sort((a,b) => b[1].amount - a[1].amount).slice(0,4);
    const merchantList = document.querySelector('.merchant-list');
    if (merchantList) {
        if (!topMerchants.length) {
            merchantList.innerHTML = '<div class="empty-state"><i class="fas fa-store-slash"></i><p>No transactions yet</p></div>';
        } else {
            merchantList.innerHTML = topMerchants.map(([name, data]) => `
                <div class="merchant-item">
                    <div class="merchant-icon"><i class="fas fa-store"></i></div>
                    <div class="merchant-info">
                        <span class="merchant-name">${name}</span>
                        <span class="merchant-transactions">${data.count} transaction${data.count>1?'s':''}</span>
                    </div>
                    <span class="merchant-amount">Rs ${formatCurrency(data.amount)}</span>
                </div>`).join('');
        }
    }
}
function downloadReport() { showSuccessAnimation('Downloading analytics report...'); }
function copyReferralCode() {
    navigator.clipboard.writeText('PAYLANCE2025').then(() => showSuccessAnimation('Referral code copied!'))
        .catch(() => alert('Referral Code: PAYLANCE2025'));
}
function updateNotifications() { closeModal(); showSuccessAnimation('Notification preferences saved!'); }
function updateSettings() { closeModal(); showSuccessAnimation('Settings updated!'); }

function toggleTheme() {
    document.body.classList.toggle('dark-theme');
    const icon = document.getElementById('themeToggle');
    if (document.body.classList.contains('dark-theme')) {
        icon?.classList.replace('fa-moon','fa-sun'); showSuccessAnimation('🌙 Dark Theme Enabled');
    } else {
        icon?.classList.replace('fa-sun','fa-moon'); showSuccessAnimation('☀️ Light Theme Enabled');
    }
}

function cardAction(action) {
    if (action==='freeze') showModal('freezeCard');
    else if (action==='limit') showModal('cardLimit');
    else showModal('cardDetails');
}
function processCardFreeze() {
    const card = document.getElementById('cardSelect').value;
    closeModal(); showSuccessAnimation(`Card ending in ${card} frozen!`);
}
function processCardLimit() {
    const daily = document.getElementById('dailyLimit').value;
    const monthly = document.getElementById('monthlyLimit').value;
    if (!daily || !monthly) { alert('❌ Enter both limits!'); return; }
    closeModal(); showSuccessAnimation('Card limits updated!');
}
function processAddCard() {
    const name = document.getElementById('cardName').value;
    const type = document.getElementById('cardType').value;
    if (!name) { alert('❌ Enter card name!'); return; }
    closeModal(); showSuccessAnimation(`${type==='virtual'?'Virtual':'Physical'} card "${name}" created!`);
}

function getCategoryColor(cat) {
    return { Shopping:'linear-gradient(135deg,#667EEA,#764BA2)', Food:'linear-gradient(135deg,#F093FB,#F5576C)',
        Transport:'linear-gradient(135deg,#4FACFE,#00F2FE)', Bills:'linear-gradient(135deg,#43E97B,#38F9D7)',
        Entertainment:'linear-gradient(135deg,#FA709A,#FEE140)', Others:'linear-gradient(135deg,#30CFD0,#330867)' }[cat]
        || 'linear-gradient(135deg,#30CFD0,#330867)';
}
function getCategoryIcon(cat) {
    return { Shopping:'fa-shopping-bag',Food:'fa-utensils',Transport:'fa-car',
        Bills:'fa-file-invoice',Entertainment:'fa-film',Others:'fa-ellipsis-h' }[cat] || 'fa-ellipsis-h';
}

// -----------------------------------------------
// MODAL
// -----------------------------------------------
function closeModal() { document.getElementById('transactionModal').style.display = 'none'; }
window.onclick = function(event) { if (event.target.classList.contains('modal-overlay')) closeModal(); };

function showModal(type) {
    const modal      = document.getElementById('transactionModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalBody  = document.getElementById('modalBody');
    let content = '';

    switch (type) {
        case 'sendMoney':
            modalTitle.textContent = 'Send Money';
            content = `<div class="form-group"><label>Recipient Mobile</label><input type="tel" id="recipientNumber" placeholder="03XXXXXXXXX" maxlength="11"></div>
                <div class="form-group"><label>Amount (Rs)</label><input type="number" id="sendAmount" placeholder="Enter amount"></div>
                <div class="form-group"><label>Purpose</label><input type="text" id="sendPurpose" placeholder="e.g., Payment"></div>
                <button class="btn-submit" onclick="processSendMoney()"><i class="fas fa-paper-plane"></i> Send Money</button>
                <button class="btn-cancel" onclick="closeModal()">Cancel</button>`;
            break;
        case 'requestMoney':
            modalTitle.textContent = 'Request Money';
            content = `<div class="form-group"><label>From Mobile</label><input type="tel" id="requestNumber" placeholder="03XXXXXXXXX" maxlength="11"></div>
                <div class="form-group"><label>Amount (Rs)</label><input type="number" id="requestAmount" placeholder="Enter amount"></div>
                <div class="form-group"><label>Reason</label><input type="text" id="requestReason" placeholder="Why?"></div>
                <button class="btn-submit" onclick="processRequestMoney()"><i class="fas fa-hand-holding-usd"></i> Send Request</button>
                <button class="btn-cancel" onclick="closeModal()">Cancel</button>`;
            break;
        case 'mobileLoad':
            modalTitle.textContent = 'Mobile Recharge';
            content = `<div class="form-group"><label>Mobile Number</label><input type="tel" id="loadNumber" placeholder="03XXXXXXXXX" maxlength="11"></div>
                <div class="form-group"><label>Package</label><select id="loadPackage">
                    <option value="100">Rs 100 - Daily</option><option value="200">Rs 200 - Weekly</option>
                    <option value="500">Rs 500 - Monthly</option><option value="1000">Rs 1000 - Premium</option></select></div>
                <button class="btn-submit" onclick="processMobileLoad()"><i class="fas fa-mobile-alt"></i> Recharge</button>
                <button class="btn-cancel" onclick="closeModal()">Cancel</button>`;
            break;
        case 'billPayment':
            modalTitle.textContent = 'Pay Bill';
            content = `<div class="form-group"><label>Bill Type</label><select id="billType">
                    <option>Electricity</option><option>Gas</option><option>Internet</option><option>Water</option><option>Education</option></select></div>
                <div class="form-group"><label>Consumer Number</label><input type="number" id="consumerNumber" placeholder="Consumer number"></div>
                <div class="form-group"><label>Amount (Rs)</label><input type="number" id="billAmount" placeholder="Amount"></div>
                <button class="btn-submit" onclick="processBillPayment()"><i class="fas fa-check-circle"></i> Pay Bill</button>
                <button class="btn-cancel" onclick="closeModal()">Cancel</button>`;
            break;
        case 'addMoney':
            modalTitle.textContent = 'Add Money';
            content = `<div class="form-group"><label>Method</label><select id="addMethod">
                    <option value="Bank">Bank Transfer</option><option value="Card">Debit/Credit Card</option><option value="Agent">Paylance Agent</option></select></div>
                <div class="form-group"><label>Amount (Rs)</label><input type="number" id="addAmount" placeholder="Amount"></div>
                <button class="btn-submit" onclick="processAddMoney()"><i class="fas fa-plus-circle"></i> Add Money</button>
                <button class="btn-cancel" onclick="closeModal()">Cancel</button>`;
            break;
        case 'splitBill':
            modalTitle.textContent = 'Split Bill';
            content = `<div class="form-group"><label>Total Amount (Rs)</label><input type="number" id="splitAmount" placeholder="Total"></div>
                <div class="form-group"><label>Number of People</label><input type="number" id="splitPeople" min="2" max="10" value="2"></div>
                <div class="form-group"><label>Description</label><input type="text" id="splitDescription" placeholder="e.g., Dinner"></div>
                <button class="btn-submit" onclick="processSplitBill()"><i class="fas fa-calculator"></i> Calculate</button>
                <button class="btn-cancel" onclick="closeModal()">Cancel</button>`;
            break;
        case 'rewards':
            const redeemable = Math.floor(cashbackPoints / 100) * 10;
            modalTitle.textContent = 'Cashback & Rewards';
            content = `<div style="text-align:center;padding:20px">
                <i class="fas fa-gift" style="font-size:60px;color:var(--primary);margin-bottom:20px"></i>
                <h3 style="color:var(--primary)">${cashbackPoints} Points</h3>
                <p>Redeem: Rs ${redeemable}</p></div>
                <button class="btn-submit" onclick="redeemCashback()" ${cashbackPoints<100?'disabled':''}>
                    <i class="fas fa-gift"></i> Redeem Rs ${redeemable}</button>
                <button class="btn-cancel" onclick="closeModal()">Close</button>`;
            break;
        case 'budgetPlanner':
            const spent = calculateMonthlySpent();
            modalTitle.textContent = 'Budget Planner';
            content = `<div class="form-group"><label>Monthly Budget (Rs)</label>
                <input type="number" id="monthlyBudgetInput" value="${monthlyBudget}"></div>
                <div style="background:#f8f9fa;padding:15px;border-radius:10px;margin:15px 0">
                    <div style="display:flex;justify-content:space-between;margin-bottom:8px">
                        <span>Spent:</span><span style="font-weight:700;color:var(--danger)">Rs ${formatCurrency(spent)}</span></div>
                    <div style="display:flex;justify-content:space-between">
                        <span>Remaining:</span><span style="font-weight:700;color:var(--success)">Rs ${formatCurrency(monthlyBudget-spent)}</span></div>
                </div>
                <button class="btn-submit" onclick="updateBudget()"><i class="fas fa-save"></i> Save</button>
                <button class="btn-cancel" onclick="closeModal()">Cancel</button>`;
            break;
        case 'addGoal':
            modalTitle.textContent = 'Add Financial Goal';
            content = `<div class="form-group"><label>Goal Name</label><input type="text" id="goalName" placeholder="e.g., New Phone"></div>
                <div class="form-group"><label>Target Amount (Rs)</label><input type="number" id="goalTarget" placeholder="Target"></div>
                <div class="form-group"><label>Current Savings (Rs)</label><input type="number" id="goalCurrent" value="0"></div>
                <div class="form-group"><label>Target Date</label><input type="date" id="goalDate"></div>
                <button class="btn-submit" onclick="addFinancialGoal()"><i class="fas fa-plus"></i> Add Goal</button>
                <button class="btn-cancel" onclick="closeModal()">Cancel</button>`;
            break;
        case 'currencyConverter':
            modalTitle.textContent = 'Currency Converter';
            content = `<div class="form-group"><label>Amount (PKR)</label>
                <input type="number" id="convertAmount" placeholder="Enter PKR" oninput="convertCurrency()"></div>
                <div class="form-group"><label>Convert To</label><select id="convertTo" onchange="convertCurrency()">
                    <option value="USD">US Dollar</option><option value="EUR">Euro</option>
                    <option value="GBP">British Pound</option><option value="AED">UAE Dirham</option>
                    <option value="SAR">Saudi Riyal</option><option value="INR">Indian Rupee</option></select></div>
                <div class="converter-result" id="converterResult">
                    <div class="converter-amount">0.00</div><div class="converter-rate">Enter amount</div></div>
                <button class="btn-cancel" onclick="closeModal()">Close</button>`;
            break;
        case 'expenseTracker':
            modalTitle.textContent = 'Expense Tracker';
            content = `<div style="margin-bottom:20px"><h4>Expenses by Category</h4>
                ${Object.keys(expenseCategories).map(cat => `
                    <div class="expense-category">
                        <div class="expense-category-icon" style="background:${getCategoryColor(cat)}">
                            <i class="fas ${getCategoryIcon(cat)}"></i></div>
                        <div class="expense-category-info"><div class="expense-category-name">${cat}</div></div>
                        <div class="expense-category-amount">Rs ${expenseCategories[cat]}</div>
                    </div>`).join('')}
                </div><button class="btn-cancel" onclick="closeModal()">Close</button>`;
            break;
        case 'recurringPayments':
            modalTitle.textContent = 'Recurring Payments';
            content = `<div style="margin-bottom:20px">
                ${recurringPayments.length===0 ? '<div class="empty-state"><i class="fas fa-redo"></i><p>No recurring payments</p></div>' :
                recurringPayments.map((p,i) => `<div class="recurring-item">
                    <div class="recurring-info">
                        <div class="recurring-title">${p.title}</div>
                        <div class="recurring-schedule">${p.schedule}</div></div>
                    <div class="recurring-amount">Rs ${p.amount}</div>
                    <div class="recurring-toggle"><label class="switch">
                        <input type="checkbox" ${p.active?'checked':''} onchange="toggleRecurring(${i})">
                        <span class="slider"></span></label></div>
                </div>`).join('')}
                </div>
                <button class="btn-submit" onclick="showModal('addRecurring')"><i class="fas fa-plus"></i> Add Recurring</button>
                <button class="btn-cancel" onclick="closeModal()">Close</button>`;
            break;
        case 'addRecurring':
            modalTitle.textContent = 'Add Recurring Payment';
            content = `<div class="form-group"><label>Title</label><input type="text" id="recurringTitle" placeholder="e.g., Netflix"></div>
                <div class="form-group"><label>Amount (Rs)</label><input type="number" id="recurringAmount"></div>
                <div class="form-group"><label>Frequency</label><select id="recurringFrequency">
                    <option>Daily</option><option>Weekly</option><option selected>Monthly</option><option>Yearly</option></select></div>
                <div class="form-group"><label>Start Date</label><input type="date" id="recurringDate"></div>
                <button class="btn-submit" onclick="addRecurringPayment()"><i class="fas fa-plus"></i> Add</button>
                <button class="btn-cancel" onclick="closeModal()">Cancel</button>`;
            break;
        case 'personalInfo':
            modalTitle.textContent = 'Personal Information';
            content = `<div class="form-group"><label>Full Name</label><input type="text" id="fullName" value="${currentUser?.name||''}"></div>
                <div class="form-group"><label>Mobile</label><input type="tel" value="${currentUser?.mobile||''}" readonly style="background:#f5f5f5"></div>
                <div class="form-group"><label>Email</label><input type="email" id="email" value="${currentUser?.email||''}"></div>
                <div class="form-group"><label>CNIC</label><input type="text" value="${currentUser?.cnic||''}" readonly style="background:#f5f5f5"></div>
                <button class="btn-submit" onclick="updatePersonalInfo()"><i class="fas fa-save"></i> Save</button>
                <button class="btn-cancel" onclick="closeModal()">Cancel</button>`;
            break;
        case 'security':
            modalTitle.textContent = 'Security & Privacy';
            content = `<div class="form-group"><label>Change PIN</label>
                <input type="password" id="currentPin" placeholder="Current PIN" maxlength="5">
                <input type="password" id="newPin" placeholder="New PIN" maxlength="5" style="margin-top:10px">
                <input type="password" id="confirmPin" placeholder="Confirm New PIN" maxlength="5" style="margin-top:10px"></div>
                <div class="form-group" style="display:flex;justify-content:space-between;align-items:center;background:#f8f9fa;padding:15px;border-radius:10px;margin-bottom:10px">
                    <div><span style="font-weight:600;display:block">Biometric Login</span>
                    <span style="font-size:12px;color:#999">Fingerprint/face login</span></div>
                    <label class="switch"><input type="checkbox" id="biometricToggle" ${currentUser?.biometricEnabled?'checked':''} onchange="toggleBiometric(this)"><span class="slider"></span></label>
                </div>
                <div class="form-group" style="display:flex;justify-content:space-between;align-items:center;background:#f8f9fa;padding:15px;border-radius:10px">
                    <div><span style="font-weight:600;display:block">Two-Factor Auth</span>
                    <span style="font-size:12px;color:#999">Extra security via SMS</span></div>
                    <label class="switch"><input type="checkbox" id="twoFactorToggle" ${currentUser?.twoFactorEnabled?'checked':''} onchange="toggle2FA(this)"><span class="slider"></span></label>
                </div>
                <button class="btn-submit" onclick="updateSecurity()"><i class="fas fa-shield-alt"></i> Update</button>
                <button class="btn-cancel" onclick="closeModal()">Close</button>`;
            break;
        case 'forgotPin':
            modalTitle.textContent = 'Forgot PIN?';
            content = `
                <div style="text-align:center;padding:10px 0 20px">
                    <i class="fas fa-lock" style="font-size:50px;color:var(--primary);margin-bottom:15px"></i>
                    <p style="color:#666;font-size:14px">Enter your account number to verify</p>
                </div>
                <div class="form-group">
                    <label>Account Number (Mobile)</label>
                    <input type="tel" id="forgotMobile" placeholder="03XXXXXXXXX" maxlength="11">
                </div>
                <button class="btn-submit" onclick="processForgotPinVerify()">
                    <i class="fas fa-search"></i> Verify Account
                </button>
                <button class="btn-cancel" onclick="closeModal()">Cancel</button>`;
            break;
        case 'forgotPinOtp':
            modalTitle.textContent = 'Enter OTP';
            content = `
                <div style="text-align:center;padding:10px 0 20px">
                    <i class="fas fa-envelope-open-text" style="font-size:50px;color:var(--primary);margin-bottom:15px"></i>
                    <p style="color:#666;font-size:14px">OTP sent to your registered email</p>
                </div>
                <div class="form-group">
                    <label>Enter 6-Digit OTP</label>
                    <input type="number" id="forgotOtpInput" placeholder="Enter OTP" maxlength="6">
                </div>
                <button class="btn-submit" onclick="processForgotPinOtp()">
                    <i class="fas fa-check-circle"></i> Verify OTP
                </button>
                <button class="btn-cancel" onclick="closeModal()">Cancel</button>`;
            break;
        case 'resetPin':
            modalTitle.textContent = 'Set New PIN';
            content = `
                <div style="text-align:center;padding:10px 0 20px">
                    <i class="fas fa-key" style="font-size:50px;color:var(--primary);margin-bottom:15px"></i>
                    <p style="color:#666;font-size:14px">Create a new 5-digit PIN</p>
                </div>
                <div class="form-group">
                    <label>New PIN</label>
                    <input type="password" id="resetNewPin" placeholder="5-digit PIN" maxlength="5">
                </div>
                <div class="form-group">
                    <label>Confirm PIN</label>
                    <input type="password" id="resetConfirmPin" placeholder="Re-enter PIN" maxlength="5">
                </div>
                <button class="btn-submit" onclick="processResetPin()">
                    <i class="fas fa-check-circle"></i> Confirm
                </button>
                <button class="btn-cancel" onclick="closeModal()">Cancel</button>`;
            break;
        case 'register':
            modalTitle.textContent = 'Create Account';
            content = `<div style="text-align:center;padding:15px 0">
                <i class="fas fa-user-plus" style="font-size:50px;color:var(--primary);margin-bottom:15px"></i>
                <p style="color:#666">Join Paylance in minutes!</p></div>
                <div class="form-group"><label>Full Name</label><input type="text" id="regName" placeholder="Full name"></div>
                <div class="form-group"><label>Mobile Number</label><input type="tel" id="regMobile" placeholder="03XXXXXXXXX" maxlength="11"></div>
                <div class="form-group"><label>CNIC Number</label><input type="text" id="regCnic" placeholder="13-digit CNIC" maxlength="13"></div>
                <div class="form-group"><label>Email Address</label><input type="email" id="regEmail" placeholder="your@email.com"></div>
                <div class="form-group"><label>Create PIN (5 digits)</label><input type="password" id="regPin" placeholder="5-digit PIN" maxlength="5"></div>
                <button class="btn-submit" onclick="processRegister()"><i class="fas fa-user-check"></i> Create Account</button>
                <button class="btn-cancel" onclick="closeModal()">Cancel</button>`;
            break;
        case 'searchTransactions':
            modalTitle.textContent = 'Search Transactions';
            content = `<div class="form-group"><label>Search</label>
                <input type="text" id="searchQuery" placeholder="Name, amount..." oninput="filterTransactions()"></div>
                <div class="form-group"><label>Type</label><select id="filterType" onchange="filterTransactions()">
                    <option value="all">All</option><option value="sent">Sent</option>
                    <option value="received">Received</option><option value="bill">Bills</option></select></div>
                <div class="form-group"><label>From</label><input type="date" id="filterDateFrom" onchange="filterTransactions()"></div>
                <div class="form-group"><label>To</label><input type="date" id="filterDateTo" onchange="filterTransactions()"></div>
                <div id="filteredTransactions" style="max-height:300px;overflow-y:auto">
                    <div class="empty-state"><i class="fas fa-search"></i><p>Start searching</p></div></div>
                <button class="btn-cancel" onclick="closeModal()">Close</button>`;
            break;
        case 'freezeCard':
            modalTitle.textContent = 'Freeze Card';
            content = `<div style="text-align:center;padding:20px">
                <i class="fas fa-snowflake" style="font-size:60px;color:var(--primary);margin-bottom:20px"></i>
                <div class="form-group"><label>Select Card</label><select id="cardSelect">
                    <option value="4532">Visa **** 4532</option><option value="8721">Mastercard **** 8721</option></select></div></div>
                <button class="btn-submit" onclick="processCardFreeze()"><i class="fas fa-snowflake"></i> Freeze</button>
                <button class="btn-cancel" onclick="closeModal()">Cancel</button>`;
            break;
        case 'cardLimit':
            modalTitle.textContent = 'Set Card Limit';
            content = `<div class="form-group"><label>Daily Limit (Rs)</label><input type="number" id="dailyLimit" value="50000"></div>
                <div class="form-group"><label>Monthly Limit (Rs)</label><input type="number" id="monthlyLimit" value="500000"></div>
                <button class="btn-submit" onclick="processCardLimit()"><i class="fas fa-check"></i> Update</button>
                <button class="btn-cancel" onclick="closeModal()">Cancel</button>`;
            break;
        case 'addCard':
            modalTitle.textContent = 'Add New Card';
            content = `<div style="text-align:center;padding:20px 0">
                <i class="fas fa-credit-card" style="font-size:48px;color:#b2bec3;margin-bottom:12px"></i>
                <p style="color:#636e72;font-size:14px">Cards are automatically assigned based on your account type.<br>Basic: 1 Virtual card<br>Verified: 1 Virtual + 2 Physical cards</p>
                ${currentUser?.accountType === 'basic' ? `<button class="btn-submit" onclick="closeModal(); showModal('kycUpgrade')"><i class="fas fa-crown"></i> Upgrade to Verified</button>` : ''}
                <button class="btn-cancel" onclick="closeModal()">Close</button>
            </div>`;
            break;
        case 'notifications':
            modalTitle.textContent = 'Notification Settings';
            content = `<div class="form-group" style="display:flex;justify-content:space-between;align-items:center;background:#f8f9fa;padding:15px;border-radius:10px;margin-bottom:10px">
                <div><span style="font-weight:600;display:block">Transaction Alerts</span>
                <span style="font-size:12px;color:#999">All transactions</span></div>
                <label class="switch"><input type="checkbox" checked><span class="slider"></span></label></div>
                <div class="form-group" style="display:flex;justify-content:space-between;align-items:center;background:#f8f9fa;padding:15px;border-radius:10px">
                <div><span style="font-weight:600;display:block">Bill Reminders</span>
                <span style="font-size:12px;color:#999">Upcoming bills</span></div>
                <label class="switch"><input type="checkbox" checked><span class="slider"></span></label></div>
                <button class="btn-submit" onclick="updateNotifications()"><i class="fas fa-bell"></i> Save</button>
                <button class="btn-cancel" onclick="closeModal()">Close</button>`;
            break;
        case 'help':
            modalTitle.textContent = 'Help & Support';
            content = `
                <div style="text-align:center;padding:10px 0 16px">
                    <i class="fas fa-headset" style="font-size:48px;color:var(--primary);margin-bottom:10px"></i>
                    <p style="color:#666;font-size:13px">We're here to help you 24/7</p>
                </div>
                <a href="tel:+923001234567" style="text-decoration:none">
                <div style="background:#f8f9fa;padding:15px;border-radius:10px;margin-bottom:10px;display:flex;align-items:center;gap:12px;cursor:pointer">
                    <div style="background:linear-gradient(135deg,#6c5ce7,#a29bfe);width:44px;height:44px;border-radius:12px;display:flex;align-items:center;justify-content:center">
                        <i class="fas fa-phone" style="color:white;font-size:18px"></i>
                    </div>
                    <div>
                        <span style="font-weight:600;display:block;color:#333">Call Support</span>
                        <span style="font-size:12px;color:#999">+92 300 1234567 — 24/7</span>
                    </div>
                    <i class="fas fa-chevron-right" style="margin-left:auto;color:#ccc"></i>
                </div></a>
                <a href="mailto:support@paylance.com" style="text-decoration:none">
                <div style="background:#f8f9fa;padding:15px;border-radius:10px;margin-bottom:10px;display:flex;align-items:center;gap:12px;cursor:pointer">
                    <div style="background:linear-gradient(135deg,#00b894,#00cec9);width:44px;height:44px;border-radius:12px;display:flex;align-items:center;justify-content:center">
                        <i class="fas fa-envelope" style="color:white;font-size:18px"></i>
                    </div>
                    <div>
                        <span style="font-weight:600;display:block;color:#333">Email Us</span>
                        <span style="font-size:12px;color:#999">support@paylance.com</span>
                    </div>
                    <i class="fas fa-chevron-right" style="margin-left:auto;color:#ccc"></i>
                </div></a>
                <div style="background:#f8f9fa;padding:15px;border-radius:10px;margin-bottom:10px">
                    <div style="font-weight:600;margin-bottom:12px;color:#333">📋 Quick FAQs</div>
                    <div style="font-size:13px;color:#555;line-height:2">
                        <div onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'block':'none'" style="cursor:pointer;font-weight:500">❓ How to send money?</div>
                        <div style="display:none;color:#999;font-size:12px;padding:4px 0 8px">Go to Home → Send Money → Enter mobile & amount → Confirm</div>
                        <div onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'block':'none'" style="cursor:pointer;font-weight:500">❓ Forgot PIN?</div>
                        <div style="display:none;color:#999;font-size:12px;padding:4px 0 8px">Login screen → Forgot PIN → Verify via email OTP</div>
                        <div onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'block':'none'" style="cursor:pointer;font-weight:500">❓ How to add money?</div>
                        <div style="display:none;color:#999;font-size:12px;padding:4px 0 8px">Home → Add Money → Choose Bank/Card → Enter amount</div>
                    </div>
                </div>
                <button class="btn-cancel" onclick="closeModal()" style="margin-top:5px">Close</button>`;
            break;
        case 'settings':
            modalTitle.textContent = 'Settings';
            content = `<div style="background:#f8f9fa;padding:15px;border-radius:10px;margin-bottom:10px">
                <span style="font-weight:600;display:block;margin-bottom:10px">Language</span>
                <select style="width:100%;padding:10px;border:2px solid #e0e0e0;border-radius:10px">
                    <option>English</option><option>Urdu</option></select></div>
                <button class="btn-submit" onclick="updateSettings()"><i class="fas fa-save"></i> Save</button>
                <button class="btn-cancel" onclick="closeModal()">Close</button>`;
            break;
        case 'referral':
            modalTitle.textContent = 'Refer & Earn';
            content = `<div style="text-align:center;padding:20px">
                <i class="fas fa-gift" style="font-size:60px;color:var(--primary);margin-bottom:20px"></i>
                <h3>Earn Rs 500 per Referral!</h3>
                <div style="background:#f8f9fa;padding:20px;border-radius:15px;margin:20px 0">
                    <span style="font-size:24px;font-weight:700;color:var(--primary)">PAYLANCE2025</span></div>
                <button class="btn-submit" onclick="copyReferralCode()"><i class="fas fa-copy"></i> Copy Code</button></div>
                <button class="btn-cancel" onclick="closeModal()">Close</button>`;
            break;
        case 'cardDetails':
            modalTitle.textContent = 'Card Details';
            content = `<div style="background:#f8f9fa;padding:20px;border-radius:15px;margin:20px 0">
                <div style="margin-bottom:15px">
                    <span style="color:#999;font-size:12px;display:block;margin-bottom:5px">Card Number</span>
                    <span style="font-size:16px;font-weight:600">5234 8765 4321 4532</span></div>
                <div style="margin-bottom:15px">
                    <span style="color:#999;font-size:12px;display:block;margin-bottom:5px">CVV</span>
                    <span style="font-size:16px;font-weight:600">***</span></div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:15px">
                    <div><span style="color:#999;font-size:12px">Expiry</span><br><span style="font-weight:600">12/25</span></div>
                    <div><span style="color:#999;font-size:12px">Status</span><br><span style="color:var(--success);font-weight:600">Active</span></div>
                </div></div>
                <button class="btn-cancel" onclick="closeModal()">Close</button>`;
            break;
        case 'linkedAccounts':
            modalTitle.textContent = 'Linked Accounts';
            content = `
                <div style="text-align:center;padding:10px 0 16px">
                    <i class="fas fa-university" style="font-size:48px;color:var(--primary);margin-bottom:10px"></i>
                    <p style="color:#666;font-size:13px">Your connected bank accounts & cards</p>
                </div>
                <div style="background:#f8f9fa;padding:15px;border-radius:10px;margin-bottom:10px;display:flex;align-items:center;gap:12px">
                    <div style="background:linear-gradient(135deg,#6c5ce7,#a29bfe);width:44px;height:44px;border-radius:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0">
                        <i class="fas fa-university" style="color:white;font-size:18px"></i>
                    </div>
                    <div style="flex:1">
                        <span style="font-weight:600;display:block">HBL Bank</span>
                        <span style="font-size:12px;color:#999">**** **** **** 4532</span>
                    </div>
                    <span style="background:#e8f5e9;color:#2e7d32;font-size:11px;padding:3px 8px;border-radius:20px;font-weight:600">Active</span>
                </div>
                <div style="background:#f8f9fa;padding:15px;border-radius:10px;margin-bottom:16px;display:flex;align-items:center;gap:12px">
                    <div style="background:linear-gradient(135deg,#f093fb,#f5576c);width:44px;height:44px;border-radius:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0">
                        <i class="fas fa-credit-card" style="color:white;font-size:18px"></i>
                    </div>
                    <div style="flex:1">
                        <span style="font-weight:600;display:block">MCB Debit Card</span>
                        <span style="font-size:12px;color:#999">**** **** **** 8721</span>
                    </div>
                    <span style="background:#e8f5e9;color:#2e7d32;font-size:11px;padding:3px 8px;border-radius:20px;font-weight:600">Active</span>
                </div>
                <button class="btn-submit" onclick="closeModal();showSuccessAnimation('Bank linking coming soon in next update!')">
                    <i class="fas fa-plus"></i> Link New Account
                </button>
                <button class="btn-cancel" onclick="closeModal()">Close</button>`;
            break;
        case 'scanQR':
            modalTitle.textContent = 'Scan QR Code';
            content = `
                <div style="text-align:center;padding:20px">
                    <div style="width:220px;height:220px;background:#f8f9fa;border-radius:16px;margin:0 auto 16px;display:flex;align-items:center;justify-content:center;border:2px dashed #6c5ce7">
                        <div>
                            <i class="fas fa-qrcode" style="font-size:60px;color:#6c5ce7;display:block;margin-bottom:10px"></i>
                            <p style="color:#999;font-size:13px">Camera access needed</p>
                        </div>
                    </div>
                    <p style="color:#666;font-size:13px">Point camera at a Paylance QR code to send money instantly</p>
                    <div style="background:#fff3cd;padding:12px;border-radius:10px;margin-top:12px;font-size:12px;color:#856404">
                        📱 Camera QR scanning requires mobile app. On web, ask sender to enter their number manually.
                    </div>
                </div>
                <button class="btn-cancel" onclick="closeModal()">Close</button>`;
            break;
        case 'investment':
        case 'kycUpgrade':
            modalTitle.textContent = 'Upgrade to Verified';
            const kycStatus = currentUser?.kyc?.status;
            if (kycStatus === 'pending') {
                content = `<div style="text-align:center;padding:20px">
                    <i class="fas fa-clock" style="font-size:48px;color:#fdcb6e;margin-bottom:12px"></i>
                    <h3 style="color:#fdcb6e">Under Review</h3>
                    <p style="color:#636e72;font-size:14px">Your KYC is submitted and being reviewed by our team. We'll notify you once approved.</p>
                    <button class="btn-cancel" onclick="closeModal()">Close</button>
                </div>`;
            } else if (kycStatus === 'rejected') {
                content = `<div style="text-align:center;padding:20px 0 10px">
                    <i class="fas fa-times-circle" style="font-size:48px;color:#d63031;margin-bottom:12px"></i>
                    <h3 style="color:#d63031">KYC Rejected</h3>
                    <p style="color:#636e72;font-size:13px;margin-bottom:16px">Reason: ${currentUser?.kyc?.rejectReason || 'Documents not acceptable'}</p>
                    <p style="color:#636e72;font-size:13px">Please resubmit with correct documents.</p>
                </div>
                ${kycFormHtml()}
                <button class="btn-submit" onclick="submitKyc()"><i class="fas fa-paper-plane"></i> Resubmit KYC</button>
                <button class="btn-cancel" onclick="closeModal()">Cancel</button>`;
            } else {
                content = `<div style="background:linear-gradient(135deg,#6C5CE7,#a29bfe);border-radius:12px;padding:16px;color:#fff;margin-bottom:16px;text-align:center">
                    <i class="fas fa-crown" style="font-size:32px;margin-bottom:8px"></i>
                    <div style="font-weight:700;font-size:16px">Verified Account Benefits</div>
                    <div style="font-size:12px;opacity:0.9;margin-top:6px">Rs 5 Lakh monthly limit • 1 Virtual + 2 Physical cards</div>
                </div>
                ${kycFormHtml()}
                <button class="btn-submit" onclick="submitKyc()"><i class="fas fa-paper-plane"></i> Submit KYC</button>
                <button class="btn-cancel" onclick="closeModal()">Cancel</button>`;
            }
            break;

        case 'savings':
        case 'insurance':
        case 'nearbyATM':
        default:
            modalTitle.textContent = 'Coming Soon';
            content = `<div style="text-align:center;padding:40px">
                <i class="fas fa-tools" style="font-size:60px;color:var(--primary);margin-bottom:20px"></i>
                <p>This feature is coming soon!</p></div>
                <button class="btn-cancel" onclick="closeModal()">Close</button>`;
    }

    modalBody.innerHTML = content;
    modal.style.display = 'flex';
}

// -----------------------------------------------
// KYC FORM HTML helper
// -----------------------------------------------
function kycFormHtml() {
    return `
        <div class="form-group"><label>Full Name</label><input type="text" id="kycFullName" placeholder="As on CNIC" value="${currentUser?.name||''}"></div>
        <div class="form-group"><label>Date of Birth</label><input type="date" id="kycDob"></div>
        <div class="form-group"><label>Address</label><input type="text" id="kycAddress" placeholder="Full residential address"></div>
        <div class="form-group"><label>CNIC Front (URL)</label><input type="text" id="kycCnicFront" placeholder="Paste image URL"></div>
        <div class="form-group"><label>CNIC Back (URL)</label><input type="text" id="kycCnicBack" placeholder="Paste image URL"></div>
        <div class="form-group"><label>Selfie (URL)</label><input type="text" id="kycSelfie" placeholder="Paste image URL"></div>
    `;
}

// -----------------------------------------------
// SUBMIT KYC
// -----------------------------------------------
async function submitKyc() {
    const fullName  = document.getElementById('kycFullName')?.value.trim();
    const dob       = document.getElementById('kycDob')?.value.trim();
    const address   = document.getElementById('kycAddress')?.value.trim();
    const cnicFront = document.getElementById('kycCnicFront')?.value.trim();
    const cnicBack  = document.getElementById('kycCnicBack')?.value.trim();
    const selfie    = document.getElementById('kycSelfie')?.value.trim();

    if (!fullName || !dob || !address || !cnicFront || !cnicBack || !selfie) {
        alert('❌ All fields are required!'); return;
    }

    try {
        const { ok, data } = await apiCall('POST', '/kyc/submit', {
            mobile: currentUser.mobile, fullName, dateOfBirth: dob,
            address, cnicFront, cnicBack, selfie
        });
        if (ok) {
            currentUser.kyc = { status: 'pending' };
            closeModal();
            showSuccessAnimation('✅ KYC Submitted! Under review.');
            updateProfileUI();
        } else {
            alert('❌ ' + (data.message || 'KYC submission failed'));
        }
    } catch { alert('❌ Server error.'); }
}

// -----------------------------------------------
// LOAD CARDS from API
// -----------------------------------------------
async function loadCards() {
    if (!currentUser) return;
    try {
        const { ok, data } = await apiCall('GET', `/cards/${currentUser.mobile}`);
        if (!ok) return;

        currentUser.cards       = data.cards || [];
        currentUser.accountType = data.accountType || 'basic';

        const container  = document.getElementById('cardsContainer');
        const banner     = document.getElementById('upgradeBanner');
        const kycBanner  = document.getElementById('kycStatusBanner');

        if (!container) return;

        // Show/hide upgrade banner — hide if KYC pending or already verified
        if (banner) {
            const kycPending = currentUser.kyc?.status === 'pending';
            banner.style.display = (data.accountType !== 'verified' && !kycPending) ? 'block' : 'none';
        }

        // Transaction limit bar
        const limitBar = document.getElementById('txLimitBar');
        const limitVal = document.getElementById('txLimitValue');
        if (limitVal) {
            const limit = currentUser.transactionLimit || (data.accountType === 'verified' ? 500000 : 25000);
            limitVal.textContent = 'Rs ' + limit.toLocaleString();
            if (limitBar) {
                limitBar.style.background = data.accountType === 'verified' ? 'rgba(0,184,148,0.08)' : '#f8f9fa';
                limitBar.style.borderColor = data.accountType === 'verified' ? 'rgba(0,184,148,0.3)' : '#e9ecef';
                if (limitVal) limitVal.style.color = data.accountType === 'verified' ? '#00b894' : '#2d3436';
            }
        }

        // KYC status banner
        if (kycBanner && currentUser.kyc) {
            if (currentUser.kyc.status === 'pending') {
                kycBanner.style.display = 'block';
                kycBanner.style.background = '#fff3cd';
                kycBanner.style.color = '#856404';
                kycBanner.innerHTML = '<i class="fas fa-clock"></i> KYC under review — we\'ll notify you once approved.';
            } else if (currentUser.kyc.status === 'rejected') {
                kycBanner.style.display = 'block';
                kycBanner.style.background = '#f8d7da';
                kycBanner.style.color = '#721c24';
                kycBanner.innerHTML = `<i class="fas fa-times-circle"></i> KYC rejected: ${currentUser.kyc.rejectReason || 'Documents not acceptable'}. <a href="#" onclick="showModal('kycUpgrade')" style="color:#721c24;font-weight:700">Resubmit</a>`;
            } else {
                kycBanner.style.display = 'none';
            }
        }

        if (!data.cards || data.cards.length === 0) {
            container.innerHTML = `<div style="text-align:center;padding:40px;color:#b2bec3">
                <i class="fas fa-credit-card" style="font-size:40px;margin-bottom:12px"></i>
                <p>No cards yet</p></div>`;
            return;
        }

        const cardColors = ['card-ocean', 'card-sunset', 'card-purple', 'card-green'];
        container.innerHTML = data.cards.map((card, i) => {
            const colorClass = cardColors[i % cardColors.length];
            const statusLabel = card.status === 'frozen' ? '❄️ Frozen' : card.status === 'hidden' ? '🙈 Hidden' : '';
            return `
            <div class="virtual-card" style="${card.status === 'hidden' ? 'opacity:0.5' : ''}">
                <div class="card-design ${colorClass}" style="position:relative">
                    <div class="card-chip-icon"><i class="fas fa-microchip"></i></div>
                    ${statusLabel ? `<div style="position:absolute;top:12px;right:12px;background:rgba(0,0,0,0.4);color:#fff;padding:4px 10px;border-radius:20px;font-size:11px">${statusLabel}</div>` : ''}
                    <div class="card-number">${card.cardNumber}</div>
                    <div class="card-info-row">
                        <div class="card-holder">
                            <span class="label">Card Holder</span>
                            <span class="value">${(currentUser.name||'').toUpperCase()}</span>
                        </div>
                        <div class="card-expiry">
                            <span class="label">Expires</span>
                            <span class="value">${card.expiry}</span>
                        </div>
                    </div>
                    <div style="position:absolute;bottom:12px;right:16px;font-size:11px;color:rgba(255,255,255,0.8);text-transform:uppercase">${card.cardType}</div>
                    <div class="card-glow-effect"></div>
                </div>
                <div style="display:flex;gap:8px;margin-top:10px;padding:0 4px">
                    <button onclick="setCardStatus('${card._id}','${card.status === 'frozen' ? 'active' : 'frozen'}')"
                        style="flex:1;padding:8px;border:none;border-radius:10px;background:${card.status==='frozen'?'#00b894':'#74b9ff'};color:#fff;font-size:12px;cursor:pointer">
                        <i class="fas fa-${card.status==='frozen'?'play':'snowflake'}"></i> ${card.status==='frozen'?'Unfreeze':'Freeze'}
                    </button>
                    <button onclick="setCardStatus('${card._id}','${card.status === 'hidden' ? 'active' : 'hidden'}')"
                        style="flex:1;padding:8px;border:none;border-radius:10px;background:#a29bfe;color:#fff;font-size:12px;cursor:pointer">
                        <i class="fas fa-${card.status==='hidden'?'eye':'eye-slash'}"></i> ${card.status==='hidden'?'Show':'Hide'}
                    </button>
                </div>
            </div>`;
        }).join('');

    } catch (err) { console.error('Load cards error:', err); }
}

// -----------------------------------------------
// SET CARD STATUS (freeze / active / hidden)
// -----------------------------------------------
async function setCardStatus(cardId, status) {
    try {
        const { ok, data } = await apiCall('PATCH', `/cards/${currentUser.mobile}/${cardId}`, { status });
        if (ok) {
            currentUser.cards = data.cards;
            loadCards();
            showSuccessAnimation(`Card ${status}!`);
        } else {
            alert('❌ ' + (data.message || 'Failed'));
        }
    } catch { alert('❌ Server error.'); }
}

// -----------------------------------------------
// UPDATE PROFILE UI (badges, upgrade button)
// -----------------------------------------------
function updateProfileUI() {
    if (!currentUser) return;

    const nameEl  = document.getElementById('profileName');
    const phoneEl = document.getElementById('profilePhone');
    if (nameEl)  nameEl.textContent  = currentUser.name   || 'User';
    if (phoneEl) phoneEl.textContent = currentUser.mobile || '';

    const badgeEl = document.getElementById('accountTypeBadge');
    if (badgeEl) {
        if (currentUser.accountType === 'verified') {
            badgeEl.innerHTML = '<i class="fas fa-check-circle"></i> Verified';
            badgeEl.className = 'badge';
            badgeEl.style.cssText = 'background:linear-gradient(135deg,#00b894,#00cec9);color:#fff;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600';
        } else {
            badgeEl.innerHTML = '<i class="fas fa-user"></i> Basic';
            badgeEl.className = 'badge';
            badgeEl.style.cssText = 'background:#dfe6e9;color:#636e72;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600';
        }
    }

    // Hide the old hardcoded badges container children except accountTypeBadge
    const badgesDiv = document.getElementById('profileBadges');
    if (badgesDiv) {
        Array.from(badgesDiv.children).forEach(el => {
            if (el.id !== 'accountTypeBadge') el.style.display = 'none';
        });
    }

    const upgradeBtn = document.getElementById('profileUpgradeBtn');
    if (upgradeBtn) {
        const kycPending = currentUser.kyc?.status === 'pending';
        upgradeBtn.style.display = (currentUser.accountType !== 'verified' && !kycPending) ? 'block' : 'none';
    }

    // Profile limit bar
    const limitVal   = document.getElementById('profileLimitValue');
    const limitBadge = document.getElementById('profileLimitBadge');
    const limitBar   = document.getElementById('profileLimitBar');
    const isVerified = currentUser.accountType === 'verified';
    const limit      = currentUser.transactionLimit || (isVerified ? 500000 : 25000);
    if (limitVal)   limitVal.textContent = 'Rs ' + limit.toLocaleString();
    if (limitBadge) {
        limitBadge.textContent = isVerified ? 'VERIFIED' : 'BASIC';
        limitBadge.style.background = isVerified ? 'linear-gradient(135deg,#00b894,#00cec9)' : '#dfe6e9';
        limitBadge.style.color      = isVerified ? '#fff' : '#636e72';
    }
    if (limitBar) {
        limitBar.style.background   = isVerified ? 'rgba(0,184,148,0.08)' : '#f0f0ff';
        limitBar.style.borderColor  = isVerified ? 'rgba(0,184,148,0.3)'  : '#d8d5ff';
    }
}
