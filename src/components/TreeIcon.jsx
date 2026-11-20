import Icon from '@ant-design/icons';

/** An outline, so `fill` from Ant's Icon, meant for solid shapes, is left out on purpose. */
// eslint-disable-next-line no-unused-vars
function TreeSvg({ fill, ...props }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M12 2.5 6.5 9.5h3l-4.5 6.5h14l-4.5-6.5h3z" />
      <path d="M12 16v5.5" />
    </svg>
  );
}

/** A tree, for a working tree: a branch checked out in another folder of the repository. */
export function TreeIcon(props) {
  return <Icon component={TreeSvg} {...props} />;
}
