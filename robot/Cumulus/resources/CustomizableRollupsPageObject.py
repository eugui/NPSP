from cumulusci.robotframework.pageobjects import pageobject
from cumulusci.robotframework.pageobjects import BasePage
from cumulusci.robotframework.utils import capture_screenshot_on_error
from BaseObjects import BaseNPSPPage
from NPSP import npsp_lex_locators



@pageobject("Custom", "CustomRollupSettings")
class CustomRollupSettingsPage(BaseNPSPPage, BasePage):
	
	def navigate_to_crlpsettings(self, filter_name=None):
		""" Click on the Navigate CRLP Button and wait for the page to load
		"""
		locator = npsp_lex_locators['id'].format("navigateCRLPs")
		self.selenium.click_element(locator)
		self.selenium.wait_until_location_contains("/one/one.app", timeout=60,
												   message="custom rollup settings page did not load in 1 min")
		self.npsp.wait_for_locator('frame_new', 'vfFrameId', 'vfFrameId')
		self.npsp.choose_frame('vfFrameId')
		link=npsp_lex_locators['link-text'].format("Back to NPSP Settings")										   
		self.selenium.wait_until_page_contains_element(link,
											  error="Current page is not a customizable rollups setting view")
	
	def is_setting_present(self, object, name):
		""" Search for the presence of an active crlp setting record already. Return a boolean value accordingly
		"""
		formatted = object+": "+name
		isPresent = False
		search_results = npsp_lex_locators['crlps']['active_setting_record'].format(formatted)
		list_ele = self.selenium.get_webelements(search_results)
		p_count=len(list_ele)
		if p_count == 0:
			print("crlp setting record Not found")
		else:
			isPresent = True
			print("crlp setting already exists")
		return isPresent
	
	@capture_screenshot_on_error
	def create_new_rollup_setting(self, **kwargs):
		""" Wait for the Iframe to be available and switch to the Frame.
		    Confirm that a rollup setting of the same type does not exist
			Click on new and create a new rollup settings record
		"""
		locator = npsp_lex_locators['crlps']['new_button'].format("New Rollup")
		select_locator = npsp_lex_locators['crlps']['select_locator'].format("Target Object")
		success_toast = npsp_lex_locators['crlps']['success_toast']
		if self.is_setting_present(kwargs['Target Object'], kwargs['Target Field']):
			 return
		else:
			self.selenium.wait_until_page_contains_element(locator)
			new_button = self.selenium.get_webelement(locator)
			self.selenium.click_element(new_button)
			self.selenium.wait_until_page_contains_element(select_locator)
			self.populate_crlp_form(**kwargs)
			self.selenium.click_button("Save")
			self.selenium.wait_until_element_is_not_visible(success_toast)

	@capture_screenshot_on_error
	def clone_rollup(self,rollup_name, **kwargs):
		""" If new rollup doesn't exist - Clone an existing rollup, enter arguments passed  and create new rollup
			If new rollup exists - logs that rollup already exists
		"""
		current_rollup=self._check_rollup_status(rollup_name)
		new_label=kwargs['Target Object']+": "+kwargs['Target Field']
		new_rollup=self._check_rollup_status(new_label)
		if current_rollup and not new_rollup:
				locator = npsp_lex_locators['crlps']['rollup_options'].format(rollup_name)
				select_locator = npsp_lex_locators['crlps']['select_locator'].format("Target Object")
				success_toast = npsp_lex_locators['crlps']['success_toast']
				self.selenium.scroll_element_into_view(locator)
				self.selenium.click_element(locator)
				self.selenium.wait_until_page_contains("Clone")
				self.selenium.click_link("Clone")
				self.selenium.wait_until_page_contains_element(select_locator)
				self.populate_crlp_form(**kwargs)
				self.selenium.click_button("Save")
				self.selenium.wait_until_element_is_not_visible(success_toast)	
		elif not current_rollup:
    			raise Exception("Rollup you are trying to clone doesn't exist")
		elif new_rollup:
    			self.builtin.log("Rollup {new_rollup} already exists, skipping creation")	
    			
    			
 
	def verify_rollup_exists(self,label):
		"""verifies if the rollup with label exists and active, if doesn't exist raises exception	
		"""
		if self._check_rollup_status(label):
			self.builtin.log("This rollup exists")
		else:
			raise Exception("Rollup does not exist")	


	def select_from_list(self,key,value):
		"""Selects the specified value from the dropdown identified with key on rollups form"""
		locator=npsp_lex_locators['crlps']['select_locator'].format(key)
		self.selenium.select_from_list_by_label(locator,value)

	def populate_crlp_form(self,**kwargs):
		"""Pass the field name and value as key, value pairs to populate the rollups form"""
		for key,value in kwargs.items():
			if key=='Description':
				self.salesforce.populate_field(key,value)
			else:
				self.select_from_list(key,value)		

	def _check_rollup_status(self,label):
		"""This is a helper API that checks if the rollup exists and active
		   Returns true if both conditions are met, else returns false 	
		"""
		ns=self.npsp.get_npsp_namespace_prefix()
		object=ns+'Rollup__mdt'
		status=False
		query="SELECT Id FROM {} WHERE Active__c = True AND Label = '{}'".format(object,label)
		record=self.salesforce.soql_query(query).get("records", [])
		print(f"record is {record}")
		if len(record)>0:
    			status=True
		return status

    			


