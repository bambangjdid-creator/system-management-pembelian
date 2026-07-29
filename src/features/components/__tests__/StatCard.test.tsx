import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FileText } from '../../../icons';
import StatCard from '../StatCard';

describe('StatCard', () => {
  it('renders title and value', () => {
    render(<StatCard title="Total PR" value={12} icon={FileText} color="bg-indigo-500" />);
    expect(screen.getByText('Total PR')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
  });
});
