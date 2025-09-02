-- Database initialization script for Excel Competitor Match Tool
-- Run this script when setting up the database for the first time

-- Ensure proper character set and collation
SET NAMES utf8mb4;
SET CHARACTER SET utf8mb4;

-- Create database if it doesn't exist
CREATE DATABASE IF NOT EXISTS excel_match
CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci;

USE excel_match;

-- Create tables
-- Jobs table for tracking Excel processing jobs
CREATE TABLE IF NOT EXISTS jobs (
    id VARCHAR(36) PRIMARY KEY,
    status ENUM('pending', 'processing', 'completed', 'failed') NOT NULL DEFAULT 'pending',
    progress INT NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
    file_path VARCHAR(500),
    result_path VARCHAR(500),
    user_email VARCHAR(255),
    total_rows INT NOT NULL DEFAULT 0,
    processed_rows INT NOT NULL DEFAULT 0,
    error_message TEXT,
    download_links TEXT,
    started_at DATETIME,
    completed_at DATETIME,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_status (status),
    INDEX idx_created_at (created_at),
    INDEX idx_user_email (user_email),
    INDEX idx_started_at (started_at, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Scraped data cache table
CREATE TABLE IF NOT EXISTS scraped_data (
    id INT AUTO_INCREMENT PRIMARY KEY,
    url_hash VARCHAR(64) NOT NULL UNIQUE,
    url VARCHAR(500) NOT NULL,
    categories TEXT NOT NULL,
    source ENUM('structured-data', 'navigation', 'products', 'links', 'fallback') NOT NULL,
    scraped_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ttl INT NOT NULL DEFAULT 86400,
    expires_at DATETIME,
    last_accessed DATETIME,
    access_count INT DEFAULT 0,
    is_valid BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_url_hash (url_hash),
    INDEX idx_expires_at (expires_at),
    INDEX idx_scraped_at (scraped_at),
    INDEX idx_last_accessed (last_accessed)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Processed results table
CREATE TABLE IF NOT EXISTS processed_results (
    id INT AUTO_INCREMENT PRIMARY KEY,
    job_id VARCHAR(36) NOT NULL,
    row_index INT NOT NULL,
    client_site VARCHAR(500) NOT NULL,
    competitor_site VARCHAR(500) NOT NULL,
    status ENUM('PASS', 'FAIL', 'MARGINAL', 'SKIPPED') NOT NULL DEFAULT 'FAIL',
    confidence DECIMAL(3,2) NOT NULL DEFAULT 0.00 CHECK (confidence >= 0 AND confidence <= 1),
    similarity_score DECIMAL(3,2) DEFAULT 0.00,
    matched_categories_count INT DEFAULT 0,
    total_common_categories TEXT,
    client_categories TEXT,
    competitor_categories TEXT,
    matching_details TEXT,
    processing_time_ms INT,
    error_message TEXT,
    attempts INT DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_job_id (job_id),
    INDEX idx_job_row (job_id, row_index),
    INDEX idx_status (status),
    INDEX idx_confidence (confidence),
    INDEX idx_client_site (client_site),
    INDEX idx_competitor_site (competitor_site),
    FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create application user (if not exists)
CREATE USER IF NOT EXISTS 'app_user'@'%' IDENTIFIED BY 'app_password';
GRANT ALL PRIVILEGES ON excel_match.* TO 'app_user'@'%';
FLUSH PRIVILEGES;

-- Insert sample data (optional, for development/testing)
-- You can uncomment these lines for initial testing

/*
INSERT INTO jobs (id, status, user_email) VALUES
('sample-job-1', 'completed', 'test@example.com'),
('sample-job-2', 'processing', 'admin@test.com');

INSERT INTO processed_results (job_id, row_index, client_site, competitor_site, status, confidence) VALUES
('sample-job-1', 1, 'http://example.com', 'http://competitor.com', 'PASS', 0.85),
('sample-job-1', 2, 'http://techsite.com', 'http://startup.com', 'FAIL', 0.25);
*/

-- Create cleanup procedures
DELIMITER //

CREATE PROCEDURE IF NOT EXISTS cleanup_expired_cache()
BEGIN
    DELETE FROM scraped_data
    WHERE expires_at < NOW() OR is_valid = FALSE;
END//

CREATE PROCEDURE IF NOT EXISTS cleanup_old_results(IN days_old INT)
BEGIN
    DELETE FROM processed_results
    WHERE created_at < DATE_SUB(NOW(), INTERVAL days_old DAY);
END//

CREATE PROCEDURE IF NOT EXISTS get_job_stats(IN job_id_param VARCHAR(36))
BEGIN
    SELECT
        COUNT(*) as total_rows,
        SUM(CASE WHEN status = 'PASS' THEN 1 ELSE 0 END) as passed,
        SUM(CASE WHEN status = 'FAIL' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN status = 'MARGINAL' THEN 1 ELSE 0 END) as marginal,
        SUM(CASE WHEN status = 'SKIPPED' THEN 1 ELSE 0 END) as skipped,
        AVG(confidence) as avg_confidence,
        AVG(processing_time_ms) as avg_processing_time
    FROM processed_results
    WHERE job_id = job_id_param;
END//

DELIMITER ;

-- Create event scheduler for automatic cleanup (optional)
-- SET GLOBAL event_scheduler = ON;

-- Uncomment these lines if you want automated cleanup:
/*
CREATE EVENT IF NOT EXISTS daily_cache_cleanup
    ON SCHEDULE EVERY 1 DAY STARTS '00:00:01'
    DO
      CALL cleanup_expired_cache();

CREATE EVENT IF NOT EXISTS monthly_results_cleanup
    ON SCHEDULE EVERY 30 DAY STARTS '00:00:01'
    DO
      CALL cleanup_old_results(90);  -- Keep results for 90 days
*/
