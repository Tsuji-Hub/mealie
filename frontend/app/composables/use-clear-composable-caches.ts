import { resetGroupRecipeActions } from "~/composables/use-group-recipe-actions";
import { resetGroupSelf } from "~/composables/use-groups";
import { resetHouseholdSelf } from "~/composables/use-households";
import { resetUserSelfRatings } from "~/composables/use-users/user-ratings";
import { resetBackups } from "~/composables/use-backups";
import { resetRecipes } from "~/composables/recipes/use-recipes";
import { resetUserRegistrationForm } from "~/composables/use-users/user-registration-form";
import { flushListCache } from "~/composables/recipes/use-list-cache";
import { resetAnyList } from "~/composables/recipes/use-anylist";

export function clearComposableCaches() {
  resetGroupRecipeActions();
  resetGroupSelf();
  resetHouseholdSelf();
  resetUserSelfRatings();
  resetBackups();
  resetRecipes();
  resetUserRegistrationForm();
  // Fork: the SWR list cache persists to localStorage for installed-PWA cold starts — it must
  // die with the session or the next user on this device inherits the previous user's lists.
  flushListCache();
  // Fork: AnyList availability + cached list names are per-session user data.
  resetAnyList();
}
