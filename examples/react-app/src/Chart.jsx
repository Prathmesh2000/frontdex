import React, { forwardRef } from 'react';
const Chart = React.memo(forwardRef(function Chart(props, ref) {
  return <canvas ref={ref} width={props.width} data-points={props.data?.length} />;
}));
export default Chart;
