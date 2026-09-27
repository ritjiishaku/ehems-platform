import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import RegisterPage from '@/app/(auth)/register/page';
import LoginPage from '@/app/(auth)/login/page';
import { getCurrentUser, isAuthenticated } from '@/lib/auth';

describe('auth flow', () => {
  it('renders the registration form', () => {
    render(<RegisterPage />);

    expect(screen.getByRole('heading', { name: /create your account/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/full name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  });

  it('renders the login form', () => {
    render(<LoginPage />);

    expect(screen.getByRole('heading', { name: /welcome back/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  });

  it('exposes a session helper for authenticated member state', () => {
    expect(typeof isAuthenticated).toBe('function');
    expect(typeof getCurrentUser).toBe('function');
  });
});
