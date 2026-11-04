// Outside Next there is no cache to tag, so these are no-ops and every read goes to the database.
export const cacheTag = () => {};
export const cacheLife = () => {};
export const updateTag = () => {};
export const revalidateTag = () => {};
export const revalidatePath = () => {};
