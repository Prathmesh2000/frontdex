import PropTypes from 'prop-types';

/** @deprecated use SiteFooter from the design system */
export function Footer({ year, links }) {
  return <footer>© {year} {links.map((l) => <a key={l} href={l}>{l}</a>)}</footer>;
}

Footer.propTypes = {
  year: PropTypes.number,
  links: PropTypes.arrayOf(PropTypes.string).isRequired,
};
Footer.defaultProps = { year: 2026 };
