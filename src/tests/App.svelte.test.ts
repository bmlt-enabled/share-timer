import { describe, test, expect } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/svelte';

import App from '@/App.svelte';

describe('NA Share Timer', () => {
  test('renders timer with default 3:00', async () => {
    render(App);
    expect(screen.getByText('03:00')).toBeInTheDocument();
  });

  test('shows Ready status on initial load', async () => {
    render(App);
    expect(screen.getByText('Ready')).toBeInTheDocument();
  });

  test('renders speaker queue section', async () => {
    render(App);
    expect(screen.getByText('Speaker Queue')).toBeInTheDocument();
  });
});
