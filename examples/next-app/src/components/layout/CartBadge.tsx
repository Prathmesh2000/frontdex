import React from 'react';
import { connect } from 'react-redux';
import type { RootState } from '@/store';
import { clearCart } from '@/store/cartSlice';

interface CartBadgeProps {
  count: number;
  onClear: () => void;
  /** Cap shown as "99+" */
  max?: number;
}

/** Legacy class component wired to Redux with connect(). Pulses when the count changes. */
class CartBadge extends React.Component<CartBadgeProps, { pulse: boolean }> {
  static defaultProps = { max: 99 };
  state = { pulse: false };
  private pulseTimer?: ReturnType<typeof setTimeout>;

  componentDidUpdate(prevProps: CartBadgeProps) {
    if (prevProps.count !== this.props.count) {
      this.setState({ pulse: true });
      this.pulseTimer = setTimeout(() => this.setState({ pulse: false }), 600);
    }
  }

  componentWillUnmount() {
    clearTimeout(this.pulseTimer);
  }

  render() {
    const { count, max = 99, onClear } = this.props;
    return (
      <span className={this.state.pulse ? 'badge badge-success pulse' : 'badge badge-success'} onDoubleClick={onClear} title="Double-click to clear">
        {count > max ? `${max}+` : count}
      </span>
    );
  }
}

const mapStateToProps = (state: RootState) => ({ count: state.cart.items.length });
const mapDispatchToProps = { onClear: clearCart };

export default connect(mapStateToProps, mapDispatchToProps)(CartBadge);
