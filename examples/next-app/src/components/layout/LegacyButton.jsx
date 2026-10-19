import React from 'react';

/**
 * Button from the old design system.
 * @deprecated use Button from '@/components/ui' instead. Still used by the blog.
 */
export default class LegacyButton extends React.PureComponent {
  static defaultProps = { kind: 'default', onPress: () => {} };

  handleClick = (event) => {
    event.preventDefault();
    this.props.onPress(event);
  };

  render() {
    return <a href="#" className={`legacy-btn legacy-btn--${this.props.kind}`} onClick={this.handleClick}>{this.props.children}</a>;
  }
}
