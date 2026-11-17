import { Tooltip as AntTooltip } from 'antd';

/**
 * Ant's tooltip, shown below what it explains unless told otherwise. Above, it covers
 * the toolbar or row the pointer is heading for. It also never holds itself open:
 * see antd-overrides.css.
 */
export function Tooltip({ placement = 'bottom', ...props }) {
  return <AntTooltip placement={placement} {...props} />;
}
