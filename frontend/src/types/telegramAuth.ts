/**
 * Telegram Login Widget user object (https://core.telegram.org/widgets/login).
 * Shared by the widget component and POST /users/telegram/link/.
 */
export type TelegramAuthUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  /** Present when the widget uses ``data-request-access`` including ``phone`` and the user approves. */
  phone_number?: string;
  auth_date: number;
  hash: string;
};
