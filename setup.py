from setuptools import setup, find_packages

with open("requirements.txt") as f:
    install_requires = f.read().strip().split("\n")

setup(
    name="frappe_ai",
    version="0.0.1",
    description="AI Assistant Integration for Frappe/ERPNext using MCP Server",
    author="Frappe",
    author_email="developers@frappe.io",
    packages=find_packages(),
    zip_safe=False,
    include_package_data=True,
    install_requires=install_requires
)

