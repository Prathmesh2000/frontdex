import React from 'react';
import { connect } from 'react-redux';
import { clearSelection } from '../store/usersSlice';

/** Bulk-action bar shown when users are selected. Legacy connect() wiring. */
class SelectionBar extends React.Component {
  render() {
    const { selectedCount, onClear } = this.props;
    if (!selectedCount) return null;
    return (
      <div className="selection-bar">
        {selectedCount} selected <button onClick={onClear}>Clear</button>
      </div>
    );
  }
}

const mapStateToProps = (state) => ({ selectedCount: state.users.selectedIds.length });
const mapDispatchToProps = { onClear: clearSelection };

export default connect(mapStateToProps, mapDispatchToProps)(SelectionBar);
