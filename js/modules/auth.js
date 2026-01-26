import { db } from '../db.js';
import { showToast, vibrate } from '../utils.js';

export async function login() {
    vibrate();
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-pass').value;
    
    const { error } = await db.auth.signInWithPassword({email, password});
    
    if(error) showToast(error.message, 'error'); 
    else location.reload();
}

export async function logout() {
    vibrate();
    const savedTheme = localStorage.getItem('theme');
    
    await db.auth.signOut();
    localStorage.clear();
    
    if (savedTheme) localStorage.setItem('theme', savedTheme);
    location.reload();
}
