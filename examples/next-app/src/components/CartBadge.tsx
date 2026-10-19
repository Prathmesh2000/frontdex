import React from 'react';
import PropTypes from 'prop-types';
import { CartContext } from '@/context/CartContext';

type State = { count: number; pulse: boolean };

class CartBadge extends React.Component<{ max: number }, State> {
  static contextType = CartContext;
  static propTypes = { max: PropTypes.number.isRequired };
  state: State = { count: 0, pulse: false };
  private timer?: number;

  componentDidMount() {
    this.timer = window.setInterval(() => this.setState({ count: this.context.items.length }), 1000);
  }

  componentDidUpdate(prevProps: { max: number }, prevState: State) {
    if (prevState.count !== this.state.count) this.setState({ pulse: true });
  }

  componentWillUnmount() {
    clearInterval(this.timer);
  }

  render() {
    return <span className={this.state.pulse ? 'pulse' : ''}>{Math.min(this.state.count, this.props.max)}</span>;
  }
}

export default CartBadge;
