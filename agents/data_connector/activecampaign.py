"""
ActiveCampaign API Connector Agent
Handles authentication, data fetching, and caching for ActiveCampaign
"""

import requests
from datetime import datetime, timedelta
from typing import Dict, List, Optional
import json


class ActiveCampaignConnector:
    """Connector for ActiveCampaign API"""
    
    def __init__(self, api_url: str, api_key: str):
        """
        Initialize ActiveCampaign connector
        
        Args:
            api_url: Base API URL (e.g., https://yourcompany.api-us1.com)
            api_key: API key for authentication
        """
        self.api_url = api_url.rstrip('/')
        self.api_key = api_key
        self.headers = {
            'Api-Token': self.api_key,
            'Content-Type': 'application/json'
        }
    
    def _make_request(self, endpoint: str, params: Optional[Dict] = None) -> Dict:
        """
        Make authenticated request to ActiveCampaign API
        
        Args:
            endpoint: API endpoint (e.g., '/api/3/contacts')
            params: Query parameters
            
        Returns:
            JSON response as dictionary
        """
        url = f"{self.api_url}{endpoint}"
        
        try:
            response = requests.get(url, headers=self.headers, params=params)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            print(f"Error fetching from ActiveCampaign: {e}")
            raise
    
    def fetch_contacts(self, limit: int = 1000, offset: int = 0) -> List[Dict]:
        """
        Fetch contacts from ActiveCampaign
        
        Args:
            limit: Number of contacts to fetch
            offset: Pagination offset
            
        Returns:
            List of contact dictionaries
        """
        endpoint = '/api/3/contacts'
        params = {'limit': limit, 'offset': offset}
        
        response = self._make_request(endpoint, params)
        return response.get('contacts', [])
    
    def fetch_deals(self, limit: int = 1000, offset: int = 0) -> List[Dict]:
        """
        Fetch deals from ActiveCampaign
        
        Args:
            limit: Number of deals to fetch
            offset: Pagination offset
            
        Returns:
            List of deal dictionaries
        """
        endpoint = '/api/3/deals'
        params = {'limit': limit, 'offset': offset}
        
        response = self._make_request(endpoint, params)
        return response.get('deals', [])
    
    def get_pipeline_stages(self) -> List[Dict]:
        """
        Get all pipeline stages
        
        Returns:
            List of pipeline stage dictionaries
        """
        endpoint = '/api/3/dealStages'
        response = self._make_request(endpoint)
        return response.get('dealStages', [])
    
    def get_pipelines(self) -> List[Dict]:
        """
        Get all pipelines
        
        Returns:
            List of pipeline dictionaries
        """
        endpoint = '/api/3/dealGroups'
        response = self._make_request(endpoint)
        return response.get('dealGroups', [])
    
    def fetch_contact_by_email(self, email: str) -> Optional[Dict]:
        """
        Fetch a specific contact by email
        
        Args:
            email: Contact email address
            
        Returns:
            Contact dictionary or None if not found
        """
        endpoint = '/api/3/contacts'
        params = {'email': email}
        
        response = self._make_request(endpoint, params)
        contacts = response.get('contacts', [])
        
        return contacts[0] if contacts else None
    
    def get_deal_custom_fields(self) -> List[Dict]:
        """
        Get all custom deal fields
        
        Returns:
            List of custom field definitions
        """
        endpoint = '/api/3/dealCustomFieldMeta'
        response = self._make_request(endpoint)
        return response.get('dealCustomFieldMeta', [])
    
    def fetch_deals_with_stages(self, limit: int = 1000) -> tuple:
        """
        Fetch deals and enrich each with its pipeline stage name/order.

        Returns:
            (deals, pipeline_stages) — deals have extra keys
            ``_stage_title`` and ``_stage_order``.
        """
        deals = self.fetch_deals(limit=limit)
        stages = self.get_pipeline_stages()
        stage_map = {s["id"]: s for s in stages}

        for deal in deals:
            stage_id = deal.get("stage")
            info = stage_map.get(stage_id, {})
            deal["_stage_title"] = info.get("title", "Unknown")
            deal["_stage_order"] = int(info.get("order", 0))

        return deals, stages

    def test_connection(self) -> bool:
        """
        Test if API connection is working

        Returns:
            True if connection successful, False otherwise
        """
        try:
            self.fetch_contacts(limit=1)
            return True
        except Exception as e:
            print(f"Connection test failed: {e}")
            return False


if __name__ == "__main__":
    # Example usage
    import yaml
    
    # Load credentials
    with open('config/credentials.yaml', 'r') as f:        config = yaml.safe_load(f)
    
    # Initialize connector
    ac = ActiveCampaignConnector(
        api_url=config['activecampaign']['api_url'],
        api_key=config['activecampaign']['api_key']
    )
    
    # Test connection
    if ac.test_connection():
        print("✅ ActiveCampaign connection successful!")
        
        # Fetch sample data
        contacts = ac.fetch_contacts(limit=5)
        print(f"\n📊 Fetched {len(contacts)} contacts")
        
        deals = ac.fetch_deals(limit=5)
        print(f"📊 Fetched {len(deals)} deals")
        
        pipelines = ac.get_pipelines()
        print(f"📊 Found {len(pipelines)} pipelines")
    else:
        print("❌ ActiveCampaign connection failed")
