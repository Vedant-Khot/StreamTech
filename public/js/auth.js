/**
 * Authentication JavaScript
 * Handles client-side auth state and UI updates
 */

class Auth {
    constructor() {
        this.user = null;
        this.authenticated = false;
    }

    // Check authentication status
    async checkAuth() {
        try {
            const response = await fetch('/api/user', {
                credentials: 'include'
            });
            const data = await response.json();

            this.authenticated = data.authenticated;
            this.user = data.user;

            return data;
        } catch (error) {
            console.error('Auth check failed:', error);
            this.authenticated = false;
            this.user = null;
            return { authenticated: false, user: null };
        }
    }

    // Update UI based on auth state
    updateUI() {
        const authBtn = document.getElementById('authBtn');
        const userAvatar = document.getElementById('userAvatar');
        const userName = document.getElementById('userName');

        if (this.authenticated && this.user) {
            // User is logged in
            if (authBtn) {
                authBtn.textContent = 'Logout';
                authBtn.href = '/auth/logout';
                authBtn.classList.remove('btn-primary');
                authBtn.classList.add('btn-secondary');
            }

            if (userAvatar && this.user.avatar) {
                userAvatar.src = this.user.avatar;
                userAvatar.style.display = 'block';
            }

            if (userName) {
                userName.textContent = this.user.name;
                userName.style.display = 'block';
            }

            console.log('👤 Logged in as:', this.user.name);
        } else {
            // User is not logged in
            if (authBtn) {
                authBtn.textContent = 'Sign In';
                authBtn.href = '/login.html';
                authBtn.classList.remove('btn-secondary');
                authBtn.classList.add('btn-primary');
            }

            if (userAvatar) {
                userAvatar.style.display = 'none';
            }

            if (userName) {
                userName.style.display = 'none';
            }
        }
    }

    // Initialize auth
    async init() {
        await this.checkAuth();
        this.updateUI();
        return this;
    }
}

// Create global auth instance
const auth = new Auth();

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    auth.init();
});
