import React from 'react';

/** Live visitor counter fed by a server-sent events stream. */
export class LiveVisitors extends React.Component<{ channel: string }, { count: number; online: boolean }> {
  state = { count: 0, online: navigator.onLine };
  private source?: EventSource;

  componentDidMount() {
    this.source = new EventSource(`/api/admin/visitors?channel=${this.props.channel}`);
    this.source.onmessage = (e) => this.setState({ count: Number(e.data) });
    // demo: intentional leak for the catalogue — no componentWillUnmount, so the listener and the EventSource outlive the component.
    window.addEventListener('online', () => this.setState({ online: true }));
  }

  render() {
    return <span className={this.state.online ? 'live' : 'live offline'}>● {this.state.count} on site</span>;
  }
}
