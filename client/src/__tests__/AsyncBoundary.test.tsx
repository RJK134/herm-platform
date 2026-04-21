import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AsyncBoundary } from '../components/AsyncBoundary';

describe('AsyncBoundary', () => {
  it('renders loading fallback while isLoading is true', () => {
    render(
      <AsyncBoundary<string> isLoading={true} isError={false} data={undefined}>
        {() => <div>ready</div>}
      </AsyncBoundary>,
    );
    expect(screen.queryByText('ready')).not.toBeInTheDocument();
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('renders error fallback when isError is true', () => {
    render(
      <AsyncBoundary<string>
        isLoading={false}
        isError={true}
        error={new Error('boom')}
        data={undefined}
      >
        {() => <div>ready</div>}
      </AsyncBoundary>,
    );
    expect(screen.getByText(/Failed to load/i)).toBeInTheDocument();
    expect(screen.getByText(/boom/)).toBeInTheDocument();
  });

  it('renders error fallback when data is undefined and not loading', () => {
    render(
      <AsyncBoundary<string> isLoading={false} isError={false} data={undefined}>
        {() => <div>ready</div>}
      </AsyncBoundary>,
    );
    expect(screen.getByText(/Failed to load/i)).toBeInTheDocument();
  });

  // These three cases used to regress under `isError || !data`: any legal but
  // falsy T (0, '', false) would flip into the error branch.
  it('passes valid falsy data (0) to children', () => {
    render(
      <AsyncBoundary<number> isLoading={false} isError={false} data={0}>
        {(n) => <div>count: {n}</div>}
      </AsyncBoundary>,
    );
    expect(screen.getByText(/count: 0/)).toBeInTheDocument();
    expect(screen.queryByText(/Failed to load/i)).not.toBeInTheDocument();
  });

  it('passes valid falsy data (empty string) to children', () => {
    render(
      <AsyncBoundary<string> isLoading={false} isError={false} data={''}>
        {(s) => <div data-testid="val">{`[${s}]`}</div>}
      </AsyncBoundary>,
    );
    expect(screen.getByTestId('val').textContent).toBe('[]');
    expect(screen.queryByText(/Failed to load/i)).not.toBeInTheDocument();
  });

  it('passes valid falsy data (false) to children', () => {
    render(
      <AsyncBoundary<boolean> isLoading={false} isError={false} data={false}>
        {(b) => <div>flag: {String(b)}</div>}
      </AsyncBoundary>,
    );
    expect(screen.getByText(/flag: false/)).toBeInTheDocument();
    expect(screen.queryByText(/Failed to load/i)).not.toBeInTheDocument();
  });

  it('renders emptyFallback when isEmpty returns true', () => {
    render(
      <AsyncBoundary<string[]>
        isLoading={false}
        isError={false}
        data={[]}
        isEmpty={(d) => d.length === 0}
      >
        {() => <div>items</div>}
      </AsyncBoundary>,
    );
    expect(screen.getByText(/no results yet/i)).toBeInTheDocument();
    expect(screen.queryByText('items')).not.toBeInTheDocument();
  });
});
