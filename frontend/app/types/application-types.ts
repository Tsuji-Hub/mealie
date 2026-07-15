export interface SideBarLink {
  key?: string;
  icon: string;
  to?: string;
  href?: string;
  title: string;
  children?: SideBarLink[];
  childrenStartExpanded?: boolean;
  restricted: boolean;
  /** Fork: optional live count shown muted at the end of the row (cookbook recipe counts). */
  count?: number | null;
}

export type SidebarLinks = Array<SideBarLink>;
