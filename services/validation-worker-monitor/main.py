import os
import time

import pandas as pd
import psycopg2
import streamlit as st

# Configuration (Matches your Docker Compose Local Settings)
DB_DSN = os.getenv("DB_DSN")

st.set_page_config(page_title="Worker Monitor", page_icon="🚀", layout="wide")


def get_connection():
    return psycopg2.connect(DB_DSN)


st.title("🚀 Validation Worker Live View")

# Auto-Refresh Logic (Simulates Real-Time)
if st.toggle("Auto-Refresh (2s)", value=True):
    time.sleep(2)
    st.rerun()

try:
    conn = get_connection()

    # --- METRICS ROW ---
    col1, col2, col3, col4 = st.columns(4)

    # Fast counts
    with conn.cursor() as cur:
        cur.execute("SELECT count(*) FROM listing_files WHERE status='PENDING'")
        pending = cur.fetchone()[0]

        cur.execute("SELECT count(*) FROM listing_files WHERE status='VALID'")
        valid = cur.fetchone()[0]

        cur.execute("SELECT count(*) FROM listing_files WHERE status='FAILED'")
        failed = cur.fetchone()[0]

        cur.execute("SELECT count(*) FROM listings WHERE status='PENDING_VALIDATION'")
        active_listings = cur.fetchone()[0]

    col1.metric("Queued Files", pending, delta_color="inverse")
    col2.metric("Validated Files", valid, delta_color="normal")
    col3.metric("Failed Files", failed, delta_color="inverse")
    col4.metric("Active Jobs (Listings)", active_listings)

    st.divider()

    # --- MAIN DATA VIEWS ---

    col_left, col_right = st.columns([2, 1])

    with col_left:
        st.subheader("Recent Files (Live)")
        query = """
        SELECT id, listing_id, file_path, status, error_message, updated_at 
        FROM listing_files 
        ORDER BY updated_at DESC 
        LIMIT 10
        """
        df_files = pd.read_sql(query, conn)

        # Color coding the status
        def color_status(val):
            color = "grey"
            if val == "VALID":
                color = "green"
            elif val == "INVALID":
                color = "red"
            elif val == "PENDING":
                color = "orange"
            return f"color: {color}"

        st.dataframe(
            df_files.style.map(color_status, subset=["status"]),
            use_container_width=True,
        )

    with col_right:
        st.subheader("Active Listings")
        query_listings = """
        SELECT id, seller_username, status, updated_at 
        FROM listings 
        WHERE status IN ('PENDING_VALIDATION', 'ACTIVE', 'REJECTED')
        ORDER BY updated_at DESC 
        LIMIT 10
        """
        df_listings = pd.read_sql(query_listings, conn)
        st.dataframe(df_listings, use_container_width=True)

except Exception as e:
    st.error(f"Could not connect to Database: {e}")
    st.info("Make sure 'docker-compose up' is running and port 5432 is exposed.")
