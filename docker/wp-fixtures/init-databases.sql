-- One MariaDB, five WordPress databases. Five separate database containers
-- would be five copies of the same thing on a laptop that has to run five
-- WordPresses next to a Next.js dev server.
CREATE DATABASE IF NOT EXISTS wp_vanilla;
CREATE DATABASE IF NOT EXISTS wp_elementor;
CREATE DATABASE IF NOT EXISTS wp_yoast;
CREATE DATABASE IF NOT EXISTS wp_rankmath;
CREATE DATABASE IF NOT EXISTS wp_hardened;
GRANT ALL ON *.* TO 'wp'@'%';
FLUSH PRIVILEGES;
