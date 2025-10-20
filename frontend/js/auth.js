// frontend/js/auth.js
const AUTH_URL = 'http://localhost:4000/api/auth';

function setToken(t){ localStorage.setItem('token', t); }
function getToken(){ return localStorage.getItem('token'); }
function clearToken(){ localStorage.removeItem('token'); }

function showError(id, message){
  const el = document.getElementById(id);
  if(!el) return;
  if(!message){ el.classList.add('hidden'); el.textContent = ''; }
  else { el.classList.remove('hidden'); el.textContent = message; }
}

document.addEventListener('DOMContentLoaded', () => {
  // LOGIN
  const loginBtn = document.getElementById('btnLogin');
  if(loginBtn){
    loginBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      showError('loginError', '');
      const identifier = document.getElementById('loginIdentifier').value.trim();
      const password = document.getElementById('loginPassword').value;
      if(!identifier || !password){
        showError('loginError', 'Isi email/username dan password.');
        return;
      }
      loginBtn.disabled = true;
      loginBtn.textContent = 'Memproses...';
      try {
        const res = await fetch(`${AUTH_URL}/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ usernameOrEmail: identifier, password })
        });
        const data = await res.json();
        if(!res.ok) throw new Error(data.message || 'Login gagal');
        setToken(data.token);
        // redirect to feed (existing feed.html)
        window.location.href = '/feed.html';
      } catch(err) {
        console.error(err);
        showError('loginError', err.message || 'Terjadi kesalahan');
      } finally {
        loginBtn.disabled = false;
        loginBtn.textContent = 'Masuk';
      }
    });
  }

  // REGISTER
  const regBtn = document.getElementById('btnRegister');
  if(regBtn){
    regBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      showError('registerError', '');
      const username = document.getElementById('regUsername').value.trim();
      const displayName = document.getElementById('regDisplayName').value.trim();
      const email = document.getElementById('regEmail').value.trim();
      const pass = document.getElementById('regPassword').value;
      const pass2 = document.getElementById('regPassword2').value;
      if(!username || !email || !pass){
        showError('registerError', 'Isi username, email, dan password.');
        return;
      }
      if(pass !== pass2){
        showError('registerError', 'Password dan konfirmasi tidak cocok.');
        return;
      }

      regBtn.disabled = true;
      regBtn.textContent = 'Memproses...';
      try {
        const res = await fetch(`${AUTH_URL}/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, email, password: pass, displayName: displayName || undefined })
        });
        const data = await res.json();
        if(!res.ok) {
          // special-case 409 for clarity
          if(res.status === 409) throw new Error(data.message || 'Username atau email sudah dipakai.');
          throw new Error(data.message || 'Pendaftaran gagal');
        }
        setToken(data.token);
        window.location.href = '/feed.html';
      } catch(err){
        console.error(err);
        showError('registerError', err.message || 'Terjadi kesalahan');
      } finally {
        regBtn.disabled = false;
        regBtn.textContent = 'Daftar';
      }
    });
  }
});
