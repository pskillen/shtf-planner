/** The Equipment screen's deep links: open the form to add a type, or to edit an item. */
export const EQUIPMENT_PATH = '/app/assets';

/** Opens the Equipment screen with the add form for this asset type already chosen. */
export const equipmentAddPath = (assetTypeId: string): string =>
  `${EQUIPMENT_PATH}?add=${encodeURIComponent(assetTypeId)}`;

/** Opens the Equipment screen with this item's edit form. */
export const equipmentEditPath = (assetId: string): string =>
  `${EQUIPMENT_PATH}?edit=${encodeURIComponent(assetId)}`;
