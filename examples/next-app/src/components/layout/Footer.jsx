import PropTypes from 'prop-types';
import Link from 'next/link';

/** Site footer with legal links. Plain JS component kept from the v1 codebase. */
export function Footer({ year, links, compact }) {
  return (
    <footer className={compact ? 'footer compact' : 'footer'}>
      <p>© {year} Northwind Traders</p>
      <ul>{links.map((l) => <li key={l.href}><Link href={l.href}>{l.label}</Link></li>)}</ul>
    </footer>
  );
}

Footer.propTypes = {
  year: PropTypes.number,
  links: PropTypes.arrayOf(PropTypes.shape({ href: PropTypes.string, label: PropTypes.string })).isRequired,
  compact: PropTypes.bool,
};

Footer.defaultProps = { year: 2026, compact: false };
