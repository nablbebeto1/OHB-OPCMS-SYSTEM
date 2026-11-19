-- PostgreSQL Initialization Script for OHB-OPCMS
-- Run as postgres superuser: sudo -u postgres psql -f deploy/scripts/init_db.sql

CREATE USER opcms_user WITH PASSWORD 'CHANGE_ME_STRONG_PASSWORD';
CREATE DATABASE ohb_opcms OWNER opcms_user ENCODING 'UTF8';
GRANT ALL PRIVILEGES ON DATABASE ohb_opcms TO opcms_user;

\c ohb_opcms
GRANT ALL ON SCHEMA public TO opcms_user;
