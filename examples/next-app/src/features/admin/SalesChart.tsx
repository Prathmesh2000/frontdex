import React from 'react';

interface Point { date: string; revenue: number }
interface SalesChartProps { data: Point[]; width: number; height?: number; currency?: string }
interface SalesChartState { max: number; hovered: number | null; prevData: Point[] }

/** Canvas revenue chart. Class component with the full lifecycle for imperative drawing. */
export class SalesChart extends React.Component<SalesChartProps, SalesChartState> {
  static defaultProps = { height: 240, currency: 'USD' };
  private canvasRef = React.createRef<HTMLCanvasElement>();
  private frame = 0;

  constructor(props: SalesChartProps) {
    super(props);
    this.state = { max: 0, hovered: null, prevData: [] };
    this.handleMove = this.handleMove.bind(this);
  }

  static getDerivedStateFromProps(props: SalesChartProps, state: SalesChartState) {
    if (props.data === state.prevData) return null;
    return { max: Math.max(1, ...props.data.map((p) => p.revenue)), prevData: props.data };
  }

  componentDidMount() {
    this.draw();
    this.canvasRef.current?.addEventListener('mousemove', this.handleMove);
  }

  shouldComponentUpdate(next: SalesChartProps, nextState: SalesChartState) {
    return next.data !== this.props.data || next.width !== this.props.width || nextState.hovered !== this.state.hovered;
  }

  getSnapshotBeforeUpdate(prevProps: SalesChartProps) {
    return prevProps.width !== this.props.width ? this.canvasRef.current?.getBoundingClientRect() ?? null : null;
  }

  componentDidUpdate(_prev: SalesChartProps, _state: SalesChartState, snapshot: DOMRect | null) {
    if (snapshot) console.debug('chart resized from', snapshot.width);
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => this.draw());
  }

  componentWillUnmount() {
    cancelAnimationFrame(this.frame);
    this.canvasRef.current?.removeEventListener('mousemove', this.handleMove);
  }

  handleMove(e: MouseEvent) {
    const index = Math.floor((e.offsetX / this.props.width) * this.props.data.length);
    this.setState({ hovered: index });
  }

  draw() {
    const ctx = this.canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { data, width, height = 240 } = this.props;
    ctx.clearRect(0, 0, width, height);
    data.forEach((p, i) => ctx.fillRect((i * width) / data.length, height - (p.revenue / this.state.max) * height, width / data.length - 2, (p.revenue / this.state.max) * height));
  }

  render() {
    const point = this.state.hovered !== null ? this.props.data[this.state.hovered] : null;
    return (
      <figure className="chart">
        <canvas ref={this.canvasRef} width={this.props.width} height={this.props.height} />
        {point && <figcaption>{point.date}: {point.revenue} {this.props.currency}</figcaption>}
      </figure>
    );
  }
}
