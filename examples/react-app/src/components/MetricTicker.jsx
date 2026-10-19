import React from 'react';
import { fetchMetrics } from '../lib/api';

/**
 * Polls the metrics endpoint and animates value changes.
 * Class component exercising every lifecycle method.
 */
export default class MetricTicker extends React.Component {
  static defaultProps = { intervalMs: 10000, label: 'Active users' };

  constructor(props) {
    super(props);
    this.state = { value: 0, previous: 0, history: [], lastInterval: props.intervalMs };
    this.listRef = React.createRef();
  }

  static getDerivedStateFromProps(props, state) {
    return props.intervalMs !== state.lastInterval ? { lastInterval: props.intervalMs, history: [] } : null;
  }

  componentDidMount() {
    this.load();
    this.timer = setInterval(() => this.load(), this.props.intervalMs);
  }

  shouldComponentUpdate(nextProps, nextState) {
    return nextState.value !== this.state.value || nextProps.label !== this.props.label;
  }

  getSnapshotBeforeUpdate() {
    const list = this.listRef.current;
    return list ? list.scrollHeight - list.scrollTop : null;
  }

  componentDidUpdate(prevProps, prevState, snapshot) {
    if (snapshot !== null && this.listRef.current) this.listRef.current.scrollTop = this.listRef.current.scrollHeight - snapshot;
    if (prevProps.intervalMs !== this.props.intervalMs) {
      clearInterval(this.timer);
      this.timer = setInterval(() => this.load(), this.props.intervalMs);
    }
  }

  componentWillUnmount() {
    clearInterval(this.timer);
  }

  load = async () => {
    const { activeUsers } = await fetchMetrics();
    this.setState((s) => ({ previous: s.value, value: activeUsers, history: [...s.history, activeUsers].slice(-20) }));
  };

  render() {
    const up = this.state.value >= this.state.previous;
    return (
      <section className="ticker">
        <h3>{this.props.label}</h3>
        <strong className={up ? 'up' : 'down'}>{this.state.value}</strong>
        <ol ref={this.listRef}>{this.state.history.map((v, i) => <li key={i}>{v}</li>)}</ol>
      </section>
    );
  }
}
