import { MoreOutlined } from '@ant-design/icons';
import { Button, Dropdown } from 'antd';

/**
 * React passes events up from a menu to the row that opened it, though the menu is drawn
 * elsewhere on the page. Only events from inside the row itself count as using the row.
 */
const isInRow = (event) => event.currentTarget.contains(event.target);

/**
 * A list row with a right-click menu, and with `menuLabel` a "⋯" button opening the same
 * menu, styled by `menuClassName`. `onActivate` and `onDoubleActivate` get clicks on the
 * row itself, never ones from the menu. Without `items` it is a plain row. Anything else
 * is passed to the `<li>`.
 */
export function MenuRow({
  items,
  onActivate,
  onDoubleActivate,
  menuLabel,
  menuClassName,
  children,
  ...props
}) {
  const hasMenu = items?.length > 0;
  const row = (
    <li
      {...props}
      onClick={onActivate && ((event) => isInRow(event) && onActivate(event))}
      onDoubleClick={onDoubleActivate && ((event) => isInRow(event) && onDoubleActivate(event))}
    >
      {children}
      {hasMenu && menuLabel && (
        <Dropdown menu={{ items }} trigger={['click']}>
          <Button
            className={menuClassName}
            type="text"
            size="small"
            icon={<MoreOutlined />}
            aria-label={menuLabel}
            // Opening the menu is not a click on the row.
            onClick={(event) => event.stopPropagation()}
          />
        </Dropdown>
      )}
    </li>
  );

  if (!hasMenu) return row;
  return (
    <Dropdown menu={{ items }} trigger={['contextMenu']}>
      {row}
    </Dropdown>
  );
}
